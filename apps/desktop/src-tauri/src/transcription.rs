use std::{
    fs::{self, OpenOptions},
    io::Write as _,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

use knowledge_ingestion::{
    ExtractedContent, IngestionError, SourceLocator, YouTubeTranscriptionFallback,
};
use reqwest::blocking::{Client, multipart};
use serde::Deserialize;
use sha2::{Digest as _, Sha256};
use zeroize::Zeroizing;

const MAX_TOOL_BYTES: usize = 100 * 1024 * 1024;
const MAX_AUDIO_BYTES: u64 = 25 * 1024 * 1024;

pub struct OpenAiYouTubeTranscriber {
    endpoint: String,
    secret: Zeroizing<String>,
    tools_directory: PathBuf,
    client: Client,
    model: &'static str,
}

impl OpenAiYouTubeTranscriber {
    pub fn new(
        endpoint: String,
        secret: Zeroizing<String>,
        tools_directory: PathBuf,
        model: &'static str,
    ) -> Result<Self, IngestionError> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_mins(3))
            .build()
            .map_err(remote_error)?;
        Ok(Self {
            endpoint,
            secret,
            tools_directory,
            client,
            model,
        })
    }

    fn download_audio(&self, url: &str, directory: &Path) -> Result<PathBuf, IngestionError> {
        let executable = self.ensure_ytdlp()?;
        let output = directory.join("audio.%(ext)s");
        let mut child = Command::new(executable)
            .args([
                "--no-playlist",
                "--no-cache-dir",
                "--no-part",
                "--max-filesize",
                "24M",
                "-f",
                "worstaudio[ext=m4a]/worstaudio[ext=webm]/worstaudio",
                "-o",
            ])
            .arg(&output)
            .arg(url)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(io_error)?;
        let started = Instant::now();
        let status = loop {
            if let Some(status) = child.try_wait().map_err(io_error)? {
                break status;
            }
            if started.elapsed() > Duration::from_mins(3) {
                let _ = child.kill();
                return Err(IngestionError::Remote(
                    "YouTube audio download exceeded three minutes".to_owned(),
                ));
            }
            std::thread::sleep(Duration::from_millis(100));
        };
        if !status.success() {
            return Err(IngestionError::MissingTranscript);
        }
        let audio = fs::read_dir(directory)
            .map_err(io_error)?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .find(|path| path.file_stem().and_then(|value| value.to_str()) == Some("audio"))
            .ok_or(IngestionError::MissingTranscript)?;
        if fs::metadata(&audio).map_err(io_error)?.len() > MAX_AUDIO_BYTES {
            return Err(IngestionError::Remote(
                "audio exceeds the cloud transcription bound; use a captioned video or local transcription"
                    .to_owned(),
            ));
        }
        Ok(audio)
    }

    fn ensure_ytdlp(&self) -> Result<PathBuf, IngestionError> {
        if let Some(configured) = std::env::var_os("KNOWLEDGE_OS_YT_DLP") {
            let path = PathBuf::from(configured);
            if path.is_file() {
                return Ok(path);
            }
        }
        fs::create_dir_all(&self.tools_directory).map_err(io_error)?;
        let executable = self.tools_directory.join(tool_file_name());
        if executable.is_file() {
            return Ok(executable);
        }
        let asset = release_asset();
        let checksums = self
            .client
            .get("https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS")
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(remote_error)?
            .text()
            .map_err(remote_error)?;
        let expected = checksums
            .lines()
            .find_map(|line| {
                let mut fields = line.split_whitespace();
                let hash = fields.next()?;
                let name = fields.next()?.trim_start_matches('*');
                (name == asset).then(|| hash.to_owned())
            })
            .ok_or_else(|| IngestionError::Remote("yt-dlp checksum is unavailable".to_owned()))?;
        let response = self
            .client
            .get(format!(
                "https://github.com/yt-dlp/yt-dlp/releases/latest/download/{asset}"
            ))
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(remote_error)?;
        if response
            .content_length()
            .is_none_or(|size| size > u64::try_from(MAX_TOOL_BYTES).unwrap_or(u64::MAX))
        {
            return Err(IngestionError::Remote(
                "yt-dlp download has an unsafe size".to_owned(),
            ));
        }
        let bytes = response.bytes().map_err(remote_error)?;
        let actual = format!("{:x}", Sha256::digest(&bytes));
        if actual != expected {
            return Err(IngestionError::Remote(
                "yt-dlp checksum verification failed".to_owned(),
            ));
        }
        let staging = self.tools_directory.join("yt-dlp.download");
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o700);
        }
        let mut file = options.open(&staging).map_err(io_error)?;
        file.write_all(&bytes).map_err(io_error)?;
        file.sync_all().map_err(io_error)?;
        fs::rename(staging, &executable).map_err(io_error)?;
        Ok(executable)
    }

    fn transcribe_audio(
        &self,
        audio: &Path,
        title: &str,
    ) -> Result<ExtractedContent, IngestionError> {
        let form = multipart::Form::new()
            .text("model", self.model)
            .text("response_format", "verbose_json")
            .file("file", audio)
            .map_err(io_error)?;
        let response = self
            .client
            .post(format!(
                "{}/audio/transcriptions",
                self.endpoint.trim_end_matches('/')
            ))
            .bearer_auth(self.secret.as_str())
            .multipart(form)
            .send()
            .map_err(remote_error)?;
        let status = response.status();
        let body: TranscriptionResponse = response.json().map_err(remote_error)?;
        if !status.is_success() {
            return Err(IngestionError::Remote(format!(
                "transcription provider returned HTTP {status}"
            )));
        }
        let segments = body.segments.unwrap_or_default();
        let (text, locators) = if segments.is_empty() {
            (
                body.text,
                vec![SourceLocator::YouTube {
                    start_seconds: 0,
                    segment: "Cloud audio transcription".to_owned(),
                }],
            )
        } else {
            (
                segments
                    .iter()
                    .map(|segment| {
                        let seconds = timestamp_seconds(segment.start);
                        format!(
                            "[{:02}:{:02}] {}",
                            seconds / 60,
                            seconds % 60,
                            segment.text.trim()
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n"),
                segments
                    .iter()
                    .map(|segment| SourceLocator::YouTube {
                        start_seconds: timestamp_seconds(segment.start),
                        segment: segment.text.trim().to_owned(),
                    })
                    .collect(),
            )
        };
        if text.trim().is_empty() {
            return Err(IngestionError::MissingTranscript);
        }
        Ok(ExtractedContent {
            title: title.to_owned(),
            body: text,
            locators,
            used_fallback: true,
        })
    }
}

impl YouTubeTranscriptionFallback for OpenAiYouTubeTranscriber {
    fn transcribe(&self, url: &str, title: &str) -> Result<ExtractedContent, IngestionError> {
        let directory = tempfile::tempdir().map_err(io_error)?;
        let audio = self.download_audio(url, directory.path())?;
        self.transcribe_audio(&audio, title)
    }
}

#[derive(Debug, Deserialize)]
struct TranscriptionResponse {
    text: String,
    segments: Option<Vec<TranscriptionSegment>>,
}

#[derive(Debug, Deserialize)]
struct TranscriptionSegment {
    start: f64,
    text: String,
}

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "finite non-negative timestamp is explicitly clamped to the u32 domain"
)]
fn timestamp_seconds(value: f64) -> u32 {
    if !value.is_finite() || value <= 0.0 {
        0
    } else if value >= f64::from(u32::MAX) {
        u32::MAX
    } else {
        value.floor() as u32
    }
}

#[cfg(target_os = "linux")]
const fn release_asset() -> &'static str {
    "yt-dlp_linux"
}

#[cfg(target_os = "macos")]
const fn release_asset() -> &'static str {
    "yt-dlp_macos"
}

#[cfg(target_os = "windows")]
const fn release_asset() -> &'static str {
    "yt-dlp.exe"
}

#[cfg(target_os = "windows")]
const fn tool_file_name() -> &'static str {
    "yt-dlp.exe"
}

#[cfg(not(target_os = "windows"))]
const fn tool_file_name() -> &'static str {
    "yt-dlp"
}

#[allow(
    clippy::needless_pass_by_value,
    reason = "map_err adapters receive owned reqwest::Error values"
)]
fn remote_error(error: reqwest::Error) -> IngestionError {
    IngestionError::Remote(error.to_string())
}

#[allow(
    clippy::needless_pass_by_value,
    reason = "map_err adapters receive owned std::io::Error values"
)]
fn io_error(error: std::io::Error) -> IngestionError {
    IngestionError::Remote(error.to_string())
}
