use std::{
    net::{IpAddr, ToSocketAddrs},
    time::Duration,
};

use reqwest::{StatusCode, blocking::Client, redirect::Policy};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::{IngestionError, SourceLocator, sanitize_html};

const MAX_REMOTE_BYTES: usize = 20 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSegment {
    pub start_seconds: u32,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedContent {
    pub title: String,
    pub body: String,
    pub locators: Vec<SourceLocator>,
    pub used_fallback: bool,
}

pub struct NativeContentAdapter {
    client: Client,
}

impl NativeContentAdapter {
    pub fn new() -> Result<Self, IngestionError> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(30))
            .redirect(Policy::none())
            .user_agent("KnowledgeOS/0.1 (+local-first knowledge capture)")
            .build()
            .map_err(remote_error)?;
        Ok(Self { client })
    }

    pub fn extract_web(&self, input: &str) -> Result<ExtractedContent, IngestionError> {
        let (final_url, body) = self.fetch_with_safe_redirects(input, 3)?;
        Ok(extract_article_html(&final_url, &body))
    }

    pub fn extract_youtube(&self, input: &str) -> Result<ExtractedContent, IngestionError> {
        let (_, page) = self.fetch_with_safe_redirects(input, 3)?;
        let (title, caption_url) = extract_youtube_page(&page)?;
        let (_, captions) = self.fetch_with_safe_redirects(&caption_url, 1)?;
        let segments = parse_caption_xml(&captions);
        if segments.is_empty() {
            return Err(IngestionError::MissingTranscript);
        }
        Ok(ExtractedContent {
            title,
            body: segments
                .iter()
                .map(|segment| segment.text.as_str())
                .collect::<Vec<_>>()
                .join(" "),
            locators: segments
                .iter()
                .map(|segment| SourceLocator::YouTube {
                    start_seconds: segment.start_seconds,
                    segment: segment.text.clone(),
                })
                .collect(),
            used_fallback: false,
        })
    }

    pub fn extract_pdf(&self, bytes: &[u8]) -> Result<ExtractedContent, IngestionError> {
        let pages = pdf_extract::extract_text_from_mem_by_pages(bytes)
            .map_err(|error| IngestionError::Remote(error.to_string()))?;
        let usable = pages
            .iter()
            .enumerate()
            .filter_map(|(index, page)| {
                let text = page.trim();
                (!text.is_empty()).then_some((index, text))
            })
            .collect::<Vec<_>>();
        if usable.is_empty() {
            return Err(IngestionError::MissingPdfText);
        }
        Ok(ExtractedContent {
            title: "PDF document".to_owned(),
            body: usable
                .iter()
                .map(|(_, text)| *text)
                .collect::<Vec<_>>()
                .join("\n\n"),
            locators: usable
                .iter()
                .map(|(index, _)| SourceLocator::Pdf {
                    page: u32::try_from(index + 1).unwrap_or(u32::MAX),
                    chunk: 0,
                })
                .collect(),
            used_fallback: false,
        })
    }

    fn fetch_with_safe_redirects(
        &self,
        input: &str,
        redirect_limit: usize,
    ) -> Result<(String, String), IngestionError> {
        let mut url = Url::parse(input).map_err(|_| IngestionError::InvalidUrl)?;
        for attempt in 0..=redirect_limit {
            ensure_public_url(&url)?;
            let response = self.client.get(url.as_str()).send().map_err(remote_error)?;
            if response.status().is_redirection() {
                if attempt == redirect_limit {
                    return Err(IngestionError::Remote("redirect limit exceeded".to_owned()));
                }
                let location = response
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .and_then(|value| value.to_str().ok())
                    .ok_or_else(|| IngestionError::Remote("redirect has no location".to_owned()))?;
                url = url.join(location).map_err(|_| IngestionError::InvalidUrl)?;
                continue;
            }
            if response.status() != StatusCode::OK {
                return Err(IngestionError::Remote(format!(
                    "HTTP status {}",
                    response.status()
                )));
            }
            if response
                .content_length()
                .is_some_and(|size| size > u64::try_from(MAX_REMOTE_BYTES).unwrap_or(u64::MAX))
            {
                return Err(IngestionError::FileTooLarge);
            }
            let bytes = response.bytes().map_err(remote_error)?;
            if bytes.len() > MAX_REMOTE_BYTES {
                return Err(IngestionError::FileTooLarge);
            }
            let body = String::from_utf8_lossy(&bytes).into_owned();
            return Ok((url.into(), body));
        }
        Err(IngestionError::Remote("redirect limit exceeded".to_owned()))
    }
}

#[must_use]
pub fn extract_article_html(url: &str, html: &str) -> ExtractedContent {
    let title = extract_between_case_insensitive(html, "<title", "</title>")
        .and_then(|value| value.split_once('>').map(|(_, text)| sanitize_html(text)))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Web article".to_owned());
    let article = extract_tag_body(html, "article")
        .or_else(|| extract_tag_body(html, "main"))
        .unwrap_or(html);
    let body = sanitize_html(article);
    ExtractedContent {
        title,
        locators: vec![SourceLocator::Web {
            url: url.to_owned(),
            section: "Article".to_owned(),
            retrieved_at: "local capture".to_owned(),
        }],
        body,
        used_fallback: false,
    }
}

pub fn extract_youtube_page(page: &str) -> Result<(String, String), IngestionError> {
    let title = extract_between_case_insensitive(page, "<title", "</title>")
        .and_then(|value| value.split_once('>').map(|(_, text)| sanitize_html(text)))
        .map_or_else(
            || "YouTube video".to_owned(),
            |value| value.trim_end_matches(" - YouTube").to_owned(),
        );
    let marker = "\"captionTracks\":";
    let start = page.find(marker).ok_or(IngestionError::MissingTranscript)? + marker.len();
    let array = balanced_json_array(&page[start..]).ok_or(IngestionError::MissingTranscript)?;
    let tracks: Vec<serde_json::Value> =
        serde_json::from_str(array).map_err(|_| IngestionError::MissingTranscript)?;
    let caption_url = tracks
        .first()
        .and_then(|track| track.get("baseUrl"))
        .and_then(serde_json::Value::as_str)
        .ok_or(IngestionError::MissingTranscript)?;
    Ok((title, caption_url.to_owned()))
}

fn parse_caption_xml(xml: &str) -> Vec<TranscriptSegment> {
    xml.split("<text ")
        .skip(1)
        .filter_map(|item| {
            let start = item
                .split_once("start=\"")?
                .1
                .split_once('"')?
                .0
                .split('.')
                .next()?
                .parse::<u32>()
                .ok()?;
            let text = item.split_once('>')?.1.split_once("</text>")?.0;
            let text = sanitize_html(
                &text
                    .replace("&#39;", "'")
                    .replace("&quot;", "\"")
                    .replace("&amp;", "&"),
            );
            (!text.is_empty()).then_some(TranscriptSegment {
                start_seconds: start,
                text,
            })
        })
        .collect()
}

fn balanced_json_array(input: &str) -> Option<&str> {
    let start = input.find('[')?;
    let mut depth = 0_usize;
    let mut quoted = false;
    let mut escaped = false;
    for (offset, character) in input[start..].char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' && quoted {
            escaped = true;
        } else if character == '"' {
            quoted = !quoted;
        } else if !quoted {
            match character {
                '[' => depth += 1,
                ']' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(&input[start..=start + offset]);
                    }
                }
                _ => {}
            }
        }
    }
    None
}

fn extract_tag_body<'a>(input: &'a str, tag: &str) -> Option<&'a str> {
    let start_marker = format!("<{tag}");
    let value = extract_between_case_insensitive(input, &start_marker, &format!("</{tag}>"))?;
    value.split_once('>').map(|(_, body)| body)
}

fn extract_between_case_insensitive<'a>(
    input: &'a str,
    start_marker: &str,
    end_marker: &str,
) -> Option<&'a str> {
    let lowercase = input.to_lowercase();
    let start = lowercase.find(&start_marker.to_lowercase())?;
    let relative_end = lowercase[start..].find(&end_marker.to_lowercase())?;
    Some(&input[start..start + relative_end])
}

fn ensure_public_url(url: &Url) -> Result<(), IngestionError> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err(IngestionError::UnsafeScheme);
    }
    let host = url.host_str().ok_or(IngestionError::UnsafeRemoteAddress)?;
    if matches!(host, "localhost" | "localhost.localdomain") {
        return Err(IngestionError::UnsafeRemoteAddress);
    }
    let port = url
        .port_or_known_default()
        .ok_or(IngestionError::UnsafeRemoteAddress)?;
    let addresses = (host, port)
        .to_socket_addrs()
        .map_err(|_| IngestionError::UnsafeRemoteAddress)?;
    for address in addresses {
        if !is_public_ip(address.ip()) {
            return Err(IngestionError::UnsafeRemoteAddress);
        }
    }
    Ok(())
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(value) => {
            !(value.is_private()
                || value.is_loopback()
                || value.is_link_local()
                || value.is_broadcast()
                || value.is_documentation()
                || value.is_unspecified())
        }
        IpAddr::V6(value) => {
            !(value.is_loopback()
                || value.is_unspecified()
                || value.is_unique_local()
                || value.is_unicast_link_local())
        }
    }
}

#[allow(
    clippy::needless_pass_by_value,
    reason = "map_err adapters receive owned reqwest::Error values"
)]
fn remote_error(error: reqwest::Error) -> IngestionError {
    IngestionError::Remote(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{is_public_ip, parse_caption_xml};
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

    #[test]
    fn caption_xml_preserves_start_seconds_and_decodes_text() {
        let segments = parse_caption_xml(
            r#"<transcript><text start="1.5" dur="2">Agents &amp; tools</text><text start="65.0" dur="2">RAG</text></transcript>"#,
        );
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].start_seconds, 1);
        assert_eq!(segments[0].text, "Agents & tools");
        assert_eq!(segments[1].start_seconds, 65);
    }

    #[test]
    fn private_loopback_and_link_local_ipv4_are_blocked() {
        for value in [
            Ipv4Addr::LOCALHOST,
            Ipv4Addr::new(10, 0, 0, 1),
            Ipv4Addr::new(169, 254, 1, 1),
        ] {
            assert!(!is_public_ip(IpAddr::V4(value)));
        }
    }

    #[test]
    fn public_ipv4_is_allowed() {
        assert!(is_public_ip(IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8))));
    }

    #[test]
    fn local_ipv6_ranges_are_blocked() {
        assert!(!is_public_ip(IpAddr::V6(Ipv6Addr::LOCALHOST)));
        assert!(!is_public_ip(IpAddr::V6("fc00::1".parse().unwrap())));
        assert!(!is_public_ip(IpAddr::V6("fe80::1".parse().unwrap())));
    }
}
