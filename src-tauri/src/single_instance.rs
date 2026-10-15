//! OSによる所有権管理を通知配送・画面起動から分離する。
use std::{
  fs::{self, File, OpenOptions, TryLockError},
  io::{self, Read, Write},
  net::{SocketAddr, TcpListener, TcpStream},
  path::{Path, PathBuf},
  sync::{mpsc, Mutex},
  thread::{self, JoinHandle},
  time::{Duration, Instant},
};

const IO_LIMIT: Duration = Duration::from_millis(200);
const RETRY: Duration = Duration::from_millis(20);

pub struct Ownership {
  _file: File,
  directory: PathBuf,
}

impl Ownership {
  pub fn acquire(directory: &Path) -> io::Result<Option<Self>> {
    fs::create_dir_all(directory)?;
    #[cfg(unix)]
    {
      use std::os::unix::fs::PermissionsExt;
      fs::set_permissions(directory, fs::Permissions::from_mode(0o700))?;
    }
    // 全起動が同じファイル実体をロックするよう、削除・置換・切り詰めを行わない。
    let file = OpenOptions::new()
      .read(true)
      .write(true)
      .create(true)
      .truncate(false)
      .open(directory.join("instance.lock"))?;
    match file.try_lock() {
      Ok(()) => Ok(Some(Self {
        _file: file,
        directory: directory.to_owned(),
      })),
      Err(TryLockError::WouldBlock) => Ok(None),
      Err(TryLockError::Error(error)) => Err(error),
    }
  }

  pub fn start(
    self,
    token: [u8; 32],
    activate: impl Fn() + Send + 'static,
  ) -> io::Result<InstanceGuard> {
    let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))?;
    listener.set_nonblocking(true)?;
    let endpoint = Endpoint {
      port: listener.local_addr()?.port(),
      token: token.iter().map(|byte| format!("{byte:02x}")).collect(),
    };
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
      use std::os::unix::fs::OpenOptionsExt;
      options.mode(0o600);
    }
    let mut file = options.open(self.directory.join("instance.endpoint"))?;
    #[cfg(unix)]
    {
      use std::os::unix::fs::PermissionsExt;
      file.set_permissions(fs::Permissions::from_mode(0o600))?;
    }
    writeln!(file, "1 {} {}", endpoint.port, endpoint.token)?;
    drop(file);
    let (stop, stopped) = mpsc::channel();
    let worker = thread::Builder::new()
      .name("instance-activation".into())
      .spawn(move || {
        loop {
          if stopped.try_recv().is_ok() {
            break;
          }
          match listener.accept() {
            Ok((mut stream, _)) => {
              // Windowsで待受の非ブロッキング設定が引き継がれる場合にも読み込み期限を適用する。
              if let Err(error) = stream.set_nonblocking(false) {
                eprintln!("could not configure instance connection: {error}");
                continue;
              }
              let deadline = Instant::now() + IO_LIMIT;
              let request = read_line(&mut stream, 128, deadline);
              if request.as_deref().ok()
                == Some(format!("ACTIVATE 1 {}\n", endpoint.token).as_bytes())
              {
                activate(); // 配送だけを行い、UIスレッドの完了を待たない。
                let _ = write_before(&mut stream, b"OK\n", deadline);
              }
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
              // 終了通知で解除できる待機。ゲームの更新ループでは実行しない。
              match stopped.recv_timeout(RETRY) {
                Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
              }
            }
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(error) => {
              eprintln!("instance listener stopped: {error}");
              break;
            }
          }
        }
      })?;
    Ok(InstanceGuard {
      _ownership: self,
      stop,
      worker: Some(worker),
    })
  }
}

impl Drop for Ownership {
  fn drop(&mut self) {
    // 後続の所有者のendpointを削除しないよう、ロック保持中にメタデータを除去する。
    let _ = fs::remove_file(self.directory.join("instance.endpoint"));
  }
}

pub struct InstanceGuard {
  _ownership: Ownership,
  stop: mpsc::Sender<()>,
  worker: Option<JoinHandle<()>>,
}
impl Drop for InstanceGuard {
  fn drop(&mut self) {
    let _ = self.stop.send(());
    if let Some(worker) = self.worker.take() {
      if worker.join().is_err() {
        eprintln!("instance listener panicked");
      }
    }
    // ワーカー終了後にOwnershipが破棄され、最後にロックファイルが閉じられる。
  }
}

struct Endpoint {
  port: u16,
  token: String,
}
impl Endpoint {
  fn parse(bytes: &[u8]) -> io::Result<Self> {
    let invalid = || io::Error::new(io::ErrorKind::InvalidData, "invalid instance endpoint");
    if bytes.len() > 256 {
      return Err(invalid());
    }
    let text = std::str::from_utf8(bytes).map_err(|_| invalid())?;
    let body = text.strip_suffix('\n').ok_or_else(invalid)?;
    let fields: Vec<_> = body.split(' ').collect();
    if fields.len() != 3 || fields[0] != "1" {
      return Err(invalid());
    }
    let port = fields[1].parse::<u16>().map_err(|_| invalid())?;
    let token = fields[2];
    if port == 0
      || token.len() != 64
      || !token
        .bytes()
        .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
    {
      return Err(invalid());
    }
    Ok(Self {
      port,
      token: token.to_owned(),
    })
  }
  fn read(directory: &Path) -> io::Result<Self> {
    let mut bytes = Vec::new();
    File::open(directory.join("instance.endpoint"))?
      .take(257)
      .read_to_end(&mut bytes)?;
    Self::parse(&bytes)
  }
  fn address(&self) -> SocketAddr {
    SocketAddr::from(([127, 0, 0, 1], self.port))
  }
}

fn remaining(deadline: Instant) -> io::Result<Duration> {
  let left = deadline.saturating_duration_since(Instant::now());
  if left.is_zero() {
    Err(io::Error::new(
      io::ErrorKind::TimedOut,
      "instance notification timed out",
    ))
  } else {
    Ok(left.min(IO_LIMIT))
  }
}
fn read_line(stream: &mut TcpStream, max: usize, deadline: Instant) -> io::Result<Vec<u8>> {
  let mut bytes = Vec::new();
  loop {
    stream.set_read_timeout(Some(remaining(deadline)?))?;
    let mut byte = [0];
    stream.read_exact(&mut byte)?;
    bytes.push(byte[0]);
    if bytes.len() > max {
      return Err(io::Error::new(
        io::ErrorKind::InvalidData,
        "instance request too long",
      ));
    }
    if byte[0] == b'\n' {
      return Ok(bytes);
    }
  }
}
fn write_before(stream: &mut TcpStream, mut bytes: &[u8], deadline: Instant) -> io::Result<()> {
  while !bytes.is_empty() {
    stream.set_write_timeout(Some(remaining(deadline)?))?;
    let count = stream.write(bytes)?;
    if count == 0 {
      return Err(io::ErrorKind::WriteZero.into());
    }
    bytes = &bytes[count..];
  }
  Ok(())
}

/// 通知失敗を理由に追加起動を所有者へ昇格させない。
pub fn notify(directory: &Path, timeout: Duration) -> io::Result<()> {
  let deadline = Instant::now() + timeout;
  loop {
    let attempt = || -> io::Result<()> {
      let endpoint = Endpoint::read(directory)?;
      let mut stream = TcpStream::connect_timeout(&endpoint.address(), remaining(deadline)?)?;
      write_before(
        &mut stream,
        format!("ACTIVATE 1 {}\n", endpoint.token).as_bytes(),
        deadline,
      )?;
      if read_line(&mut stream, 3, deadline)? == b"OK\n" {
        Ok(())
      } else {
        Err(io::Error::new(
          io::ErrorKind::InvalidData,
          "invalid instance response",
        ))
      }
    };
    if attempt().is_ok() {
      return Ok(());
    }
    thread::sleep(remaining(deadline)?.min(RETRY));
  }
}

#[derive(Default)]
struct ActivationState {
  ready: bool,
  pending: bool,
  scheduled: bool,
  stopping: bool,
}
/// UI配送は最大1件とし、起動中の要求はReadyまで保留する。
#[derive(Default)]
pub struct Activation {
  state: Mutex<ActivationState>,
}
impl Activation {
  pub fn request(&self) -> bool {
    let mut state = self.state.lock().unwrap();
    if state.stopping {
      return false;
    }
    state.pending = true;
    Self::schedule(&mut state)
  }
  pub fn ready(&self) -> bool {
    let mut state = self.state.lock().unwrap();
    if state.stopping {
      return false;
    }
    state.ready = true;
    Self::schedule(&mut state)
  }
  fn schedule(state: &mut ActivationState) -> bool {
    if state.ready && state.pending && !state.scheduled {
      state.scheduled = true;
      true
    } else {
      false
    }
  }
  pub fn take(&self) -> bool {
    let mut state = self.state.lock().unwrap();
    state.scheduled = false;
    let pending = state.pending && !state.stopping;
    state.pending = false;
    pending
  }
  pub fn delivery_failed(&self) {
    self.state.lock().unwrap().scheduled = false;
  }
  pub fn stop(&self) {
    let mut state = self.state.lock().unwrap();
    state.stopping = true;
    state.pending = false;
  }
}

#[cfg(test)]
#[path = "single_instance_tests.rs"]
mod tests;
