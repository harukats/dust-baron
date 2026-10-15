use super::*;
use std::{
  process::{Child, Command, Stdio},
  sync::atomic::{AtomicUsize, Ordering},
  thread,
  time::{Duration, Instant},
};

static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Temp(PathBuf);
impl Temp {
  fn new() -> Self {
    let p = std::env::temp_dir().join(format!(
      "dust-baron-test-{}-{}",
      std::process::id(),
      NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&p).unwrap();
    Self(p)
  }
}
impl Drop for Temp {
  fn drop(&mut self) {
    let _ = std::fs::remove_dir_all(&self.0);
  }
}
fn wait_for(mut test: impl FnMut() -> bool) {
  let deadline = Instant::now() + Duration::from_secs(10);
  while !test() {
    assert!(Instant::now() < deadline, "child deadline exceeded");
    thread::sleep(Duration::from_millis(5));
  }
}
struct Worker(Child);
impl Drop for Worker {
  fn drop(&mut self) {
    let _ = self.0.kill();
    let _ = self.0.wait();
  }
}
fn child(dir: &Path, id: usize) -> Worker {
  Worker(
    Command::new(std::env::current_exe().unwrap())
      .args(["ownership_child", "--nocapture"])
      .env("DUST_BARON_TEST_DIR", dir)
      .env("DUST_BARON_TEST_ID", id.to_string())
      .stdout(Stdio::null())
      .spawn()
      .unwrap(),
  )
}
#[test]
fn ownership_child() {
  let Some(dir) = std::env::var_os("DUST_BARON_TEST_DIR") else {
    return;
  };
  let dir = PathBuf::from(dir);
  let id = std::env::var("DUST_BARON_TEST_ID").unwrap();
  std::fs::write(dir.join(format!("ready-{id}")), "").unwrap();
  wait_for(|| dir.join("go").exists());
  let owner = Ownership::acquire(&dir.join("instance")).unwrap();
  std::fs::write(
    dir.join(format!("result-{id}")),
    if owner.is_some() {
      "primary"
    } else {
      "secondary"
    },
  )
  .unwrap();
  if owner.is_some() {
    wait_for(|| dir.join("release").exists());
  }
  drop(owner);
}
#[test]
fn concurrent_cold_launches_have_one_owner() {
  for _ in 0..3 {
    let dir = Temp::new();
    let mut children: Vec<_> = (0..5).map(|i| child(&dir.0, i)).collect();
    wait_for(|| (0..5).all(|i| dir.0.join(format!("ready-{i}")).exists()));
    std::fs::write(dir.0.join("go"), "").unwrap();
    wait_for(|| (0..5).all(|i| dir.0.join(format!("result-{i}")).exists()));
    assert_eq!(
      (0..5)
        .filter(
          |i| std::fs::read_to_string(dir.0.join(format!("result-{i}"))).unwrap() == "primary"
        )
        .count(),
      1
    );
    std::fs::write(dir.0.join("release"), "").unwrap();
    for c in &mut children {
      wait_for(|| c.0.try_wait().unwrap().is_some());
      assert!(c.0.wait().unwrap().success());
    }
  }
}
#[test]
fn additional_launches_cannot_claim_lock() {
  let dir = Temp::new();
  let _owner = Ownership::acquire(&dir.0).unwrap().unwrap();
  for _ in 0..10 {
    assert!(Ownership::acquire(&dir.0).unwrap().is_none());
  }
  assert_eq!(
    std::fs::metadata(dir.0.join("instance.lock"))
      .unwrap()
      .len(),
    0
  );
}
#[test]
fn invalid_directory_is_an_error() {
  let dir = Temp::new();
  let file = dir.0.join("file");
  std::fs::write(&file, "x").unwrap();
  assert!(Ownership::acquire(&file).is_err());
}

#[test]
fn normal_exit_and_stale_endpoint_allow_reclaim() {
  let dir = Temp::new();
  for _ in 0..3 {
    let owner = Ownership::acquire(&dir.0).unwrap().unwrap();
    std::fs::write(dir.0.join("instance.endpoint"), "stale").unwrap();
    drop(owner);
    assert!(dir.0.join("instance.lock").exists());
    wait_for(|| Ownership::acquire(&dir.0).unwrap().is_some());
  }
}
#[test]
fn killed_owner_releases_os_lock() {
  for _ in 0..3 {
    let dir = Temp::new();
    let mut owner = child(&dir.0, 0);
    wait_for(|| dir.0.join("ready-0").exists());
    std::fs::write(dir.0.join("go"), "").unwrap();
    wait_for(|| dir.0.join("result-0").exists());
    assert_eq!(
      std::fs::read_to_string(dir.0.join("result-0")).unwrap(),
      "primary"
    );
    assert!(Ownership::acquire(&dir.0.join("instance"))
      .unwrap()
      .is_none());
    owner.0.kill().unwrap();
    owner.0.wait().unwrap();
    assert!(Ownership::acquire(&dir.0.join("instance"))
      .unwrap()
      .is_some());
  }
}

#[test]
fn activation_requests_are_coalesced_and_stop_is_final() {
  let activation = Activation::default();
  assert!(!activation.request());
  assert!(!activation.request());
  assert!(activation.ready());
  assert!(!activation.request());
  assert!(activation.take());
  assert!(!activation.take());
  assert!(activation.request());
  activation.stop();
  assert!(!activation.take());
  assert!(!activation.request());
  assert!(!activation.ready());
}
#[test]
fn endpoint_validation_is_bounded_and_strict() {
  let token = "ab".repeat(32);
  assert!(Endpoint::parse(format!("1 1234 {token}\n").as_bytes()).is_ok());
  for bad in [
    format!("1 0 {token}\n"),
    format!("2 1234 {token}\n"),
    "x".repeat(257),
    format!("1 1234 {token}\nextra"),
    "1 1234 short\n".into(),
  ] {
    assert!(Endpoint::parse(bad.as_bytes()).is_err());
  }
}
#[test]
fn valid_notification_and_invalid_requests() {
  let dir = Temp::new();
  let activation = std::sync::Arc::new(Activation::default());
  let a = activation.clone();
  let count = std::sync::Arc::new(AtomicUsize::new(0));
  let calls = count.clone();
  let guard = Ownership::acquire(&dir.0)
    .unwrap()
    .unwrap()
    .start([1; 32], move || {
      calls.fetch_add(1, Ordering::SeqCst);
      a.request();
    })
    .unwrap();
  let endpoint = Endpoint::read(&dir.0).unwrap();
  for bad in [
    "ACTIVATE 1 bad\n".to_string(),
    "x".repeat(129),
    format!("ACTIVATE 2 {}\n", endpoint.token),
  ] {
    let mut stream = std::net::TcpStream::connect(endpoint.address()).unwrap();
    use std::io::Write;
    stream.write_all(bad.as_bytes()).unwrap();
    stream.shutdown(std::net::Shutdown::Write).unwrap();
  }
  notify(&dir.0, Duration::from_secs(2)).unwrap();
  assert_eq!(count.load(Ordering::SeqCst), 1);
  assert!(activation.ready());
  assert!(activation.take());
  assert!(!activation.take());
  let started = Instant::now();
  drop(guard);
  assert!(started.elapsed() < Duration::from_secs(1));
  assert!(!dir.0.join("instance.endpoint").exists());
  wait_for(|| Ownership::acquire(&dir.0).unwrap().is_some());
}
#[test]
fn notification_waits_for_endpoint_and_has_total_deadline() {
  let dir = Temp::new();
  let owner = Ownership::acquire(&dir.0).unwrap().unwrap();
  std::fs::write(dir.0.join("instance.endpoint"), "stale").unwrap();
  let path = dir.0.clone();
  let client = thread::spawn(move || notify(&path, Duration::from_secs(2)));
  thread::sleep(Duration::from_millis(40));
  let guard = owner.start([2; 32], || {}).unwrap();
  client.join().unwrap().unwrap();
  drop(guard);
  let started = Instant::now();
  assert!(notify(&dir.0, Duration::from_millis(80)).is_err());
  assert!(started.elapsed() < Duration::from_millis(300));
}
#[test]
fn shutdown_interrupts_idle_partial_and_active_connections() {
  for mode in 0..3 {
    let dir = Temp::new();
    let (tx, rx) = std::sync::mpsc::channel();
    let guard = Ownership::acquire(&dir.0)
      .unwrap()
      .unwrap()
      .start([3; 32], move || {
        tx.send(()).unwrap();
      })
      .unwrap();
    let endpoint = Endpoint::read(&dir.0).unwrap();
    let mut stream = std::net::TcpStream::connect(endpoint.address()).unwrap();
    use std::io::Write;
    if mode == 1 {
      stream.write_all(b"ACTIVATE ").unwrap();
      thread::sleep(Duration::from_millis(30));
    }
    if mode == 2 {
      stream
        .write_all(format!("ACTIVATE 1 {}\n", endpoint.token).as_bytes())
        .unwrap();
      rx.recv_timeout(Duration::from_secs(1)).unwrap();
    }
    let started = Instant::now();
    drop(guard);
    assert!(started.elapsed() < Duration::from_secs(1));
    wait_for(|| Ownership::acquire(&dir.0).unwrap().is_some());
  }
}

#[test]
fn failed_delivery_can_be_retried() {
  let activation = Activation::default();
  assert!(!activation.ready());
  assert!(activation.request());
  activation.delivery_failed();
  assert!(activation.request());
  assert!(activation.take());
}

#[test]
fn simultaneous_ready_and_request_never_lose_activation() {
  for _ in 0..100 {
    let activation = std::sync::Arc::new(Activation::default());
    let a = activation.clone();
    let worker = thread::spawn(move || a.request());
    let ready = activation.ready();
    let requested = worker.join().unwrap();
    assert!(ready || requested);
    wait_for(|| activation.state.lock().unwrap().pending);
    assert!(activation.take());
  }
}

#[test]
fn permissions_and_stale_endpoint_are_replaced() {
  let dir = Temp::new();
  std::fs::write(dir.0.join("instance.endpoint"), "invalid").unwrap();
  let guard = Ownership::acquire(&dir.0)
    .unwrap()
    .unwrap()
    .start([4; 32], || {})
    .unwrap();
  let endpoint = Endpoint::read(&dir.0).unwrap();
  assert_eq!(endpoint.token, "04".repeat(32));
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    assert_eq!(
      std::fs::metadata(&dir.0).unwrap().permissions().mode() & 0o777,
      0o700
    );
    assert_eq!(
      std::fs::metadata(dir.0.join("instance.endpoint"))
        .unwrap()
        .permissions()
        .mode()
        & 0o777,
      0o600
    );
  }
  drop(guard);
}

#[test]
fn partial_request_expires_without_blocking_next_activation() {
  let dir = Temp::new();
  let count = std::sync::Arc::new(AtomicUsize::new(0));
  let c = count.clone();
  let _guard = Ownership::acquire(&dir.0)
    .unwrap()
    .unwrap()
    .start([5; 32], move || {
      c.fetch_add(1, Ordering::SeqCst);
    })
    .unwrap();
  let endpoint = Endpoint::read(&dir.0).unwrap();
  let mut slow = std::net::TcpStream::connect(endpoint.address()).unwrap();
  use std::io::Write;
  slow.write_all(b"ACTIVATE ").unwrap();
  thread::sleep(Duration::from_millis(250));
  notify(&dir.0, Duration::from_secs(2)).unwrap();
  assert_eq!(count.load(Ordering::SeqCst), 1);
}

#[test]
fn preparation_failure_releases_ownership() {
  let dir = Temp::new();
  std::fs::create_dir(dir.0.join("instance.endpoint")).unwrap();
  let owner = Ownership::acquire(&dir.0).unwrap().unwrap();
  assert!(owner.start([6; 32], || {}).is_err());
  wait_for(|| Ownership::acquire(&dir.0).unwrap().is_some());
}

#[test]
fn notification_failure_never_releases_another_owner() {
  let dir = Temp::new();
  let _owner = Ownership::acquire(&dir.0).unwrap().unwrap();
  let started = Instant::now();
  assert!(notify(&dir.0, Duration::from_millis(80)).is_err());
  assert!(started.elapsed() < Duration::from_millis(300));
  assert!(Ownership::acquire(&dir.0).unwrap().is_none());
}
