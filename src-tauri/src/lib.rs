mod single_instance;

use single_instance::{Activation, Ownership};
use std::{
  sync::{Arc, OnceLock},
  time::Duration,
};
use tauri::{AppHandle, Manager, RunEvent};

fn queue_activation(app: &AppHandle, activation: &Arc<Activation>) {
  let handle = app.clone();
  let state = activation.clone();
  if let Err(error) = app.run_on_main_thread(move || {
    if !state.take() {
      return;
    }
    if let Some(window) = handle.get_webview_window("main") {
      // フォーカス制限があっても、ほかの復元操作を省略しない。
      for result in [window.show(), window.unminimize(), window.set_focus()] {
        if let Err(error) = result {
          eprintln!("could not restore game window: {error}");
        }
      }
    }
  }) {
    activation.delivery_failed();
    eprintln!("could not queue game window activation: {error}");
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  if let Err(error) = run_desktop() {
    eprintln!("could not start Dust Baron: {error}");
    std::process::exit(1);
  }
}

fn run_desktop() -> Result<(), Box<dyn std::error::Error>> {
  let context = tauri::generate_context!();
  let directory = dirs::data_local_dir()
    .ok_or_else(|| {
      std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "local data directory unavailable",
      )
    })?
    .join(&context.config().identifier);
  // アプリ構築・WebView生成より前に所有権を確立する。
  let Some(owner) = Ownership::acquire(&directory)? else {
    if let Err(error) = single_instance::notify(&directory, Duration::from_secs(2)) {
      eprintln!("could not notify the running game: {error}");
    }
    return Ok(());
  };
  let mut token = [0; 32];
  getrandom::fill(&mut token).map_err(|error| std::io::Error::other(error.to_string()))?;
  let activation = Arc::new(Activation::default());
  let app_handle = Arc::new(OnceLock::<AppHandle>::new());
  let state = activation.clone();
  let target = app_handle.clone();
  let guard = owner.start(token, move || {
    if state.request() {
      if let Some(app) = target.get() {
        queue_activation(app, &state);
      }
    }
  })?;
  let app = tauri::Builder::default().build(context)?;
  let _ = app_handle.set(app.handle().clone());
  let mut guard = Some(guard);
  app.run(move |app, event| match event {
    RunEvent::Ready => {
      if activation.ready() {
        queue_activation(app, &activation);
      }
    }
    #[cfg(target_os = "macos")]
    RunEvent::Reopen { .. } => {
      if activation.request() {
        queue_activation(app, &activation);
      }
    }
    RunEvent::Exit => {
      activation.stop();
      // ExitRequestedは取消可能なので、実際のExitでのみ解放する。
      drop(guard.take());
    }
    _ => {}
  });
  Ok(())
}
