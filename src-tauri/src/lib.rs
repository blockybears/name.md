use serde::{Deserialize, Serialize};
use std::{
  env, fs,
  path::{Path, PathBuf},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectoryEntry {
  path: String,
  name: String,
  is_dir: bool,
  extension: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitHubHeader {
  name: String,
  value: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitHubHttpRequest {
  method: String,
  url: String,
  headers: Vec<GitHubHeader>,
  body: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitHubHttpResponse {
  status: u16,
  body: String,
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
  fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_startup_file_paths() -> Vec<String> {
  env::args_os()
    .skip(1)
    .filter_map(|arg| {
      let path = PathBuf::from(arg);
      if path.is_file() {
        Some(path.to_string_lossy().to_string())
      } else {
        None
      }
    })
    .collect()
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
  fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<DirectoryEntry>, String> {
  let mut entries = Vec::new();

  for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
    let entry = entry.map_err(|error| error.to_string())?;
    let path = entry.path();
    let metadata = entry.metadata().map_err(|error| error.to_string())?;
    let name = entry
      .file_name()
      .to_string_lossy()
      .to_string();

    entries.push(DirectoryEntry {
      path: path.to_string_lossy().to_string(),
      name,
      is_dir: metadata.is_dir(),
      extension: path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_lowercase()),
    });
  }

  Ok(entries)
}

#[tauri::command]
fn create_directory(path: String) -> Result<(), String> {
  fs::create_dir_all(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
  if let Some(parent) = Path::new(&to).parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }

  fs::rename(from, to).map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
  let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
  if metadata.is_dir() {
    fs::remove_dir_all(path).map_err(|error| error.to_string())
  } else {
    fs::remove_file(path).map_err(|error| error.to_string())
  }
}

#[tauri::command]
async fn github_http(request: GitHubHttpRequest) -> Result<GitHubHttpResponse, String> {
  if !request.url.starts_with("https://api.github.com/")
    && !request.url.starts_with("https://github.com/login/")
  {
    return Err("Only GitHub API and OAuth URLs are allowed".to_string());
  }

  let client = reqwest::Client::new();
  let method = request
    .method
    .parse::<reqwest::Method>()
    .map_err(|error| error.to_string())?;
  let mut builder = client.request(method, request.url);

  for header in request.headers {
    builder = builder.header(header.name, header.value);
  }

  if let Some(body) = request.body {
    builder = builder.body(body);
  }

  let response = builder.send().await.map_err(|error| error.to_string())?;
  let status = response.status().as_u16();
  let body = response.text().await.map_err(|error| error.to_string())?;

  Ok(GitHubHttpResponse { status, body })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      get_startup_file_paths,
      read_text_file,
      write_text_file,
      list_directory,
      create_directory,
      rename_path,
      delete_path,
      github_http
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
