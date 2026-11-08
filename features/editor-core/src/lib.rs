//! editor-core — document model and editing primitives for MCode.
//!
//! Placeholder scaffolding: replace with the real buffer implementation
//! (rope/piece-table) when the editor feature gets built out.

/// Minimal editing buffer stub.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Buffer {
    text: String,
}

impl Buffer {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_text(text: impl Into<String>) -> Self {
        Self { text: text.into() }
    }

    pub fn text(&self) -> &str {
        &self.text
    }

    /// Insert `text` at byte offset `at`, clamped to the buffer length.
    pub fn insert(&mut self, at: usize, text: &str) {
        let at = at.min(self.text.len());
        // Snap to a char boundary so we never panic on multibyte text.
        let at = self.snap(at);
        self.text.insert_str(at, text);
    }

    pub fn line_count(&self) -> usize {
        self.text.lines().count().max(1)
    }

    fn snap(&self, at: usize) -> usize {
        if self.text.is_char_boundary(at) {
            at
        } else {
            (at..self.text.len())
                .find(|&i| self.text.is_char_boundary(i))
                .unwrap_or(self.text.len())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inserts_and_counts_lines() {
        let mut b = Buffer::new();
        b.insert(0, "hello");
        b.insert(5, "\nworld");
        assert_eq!(b.text(), "hello\nworld");
        assert_eq!(b.line_count(), 2);
    }

    #[test]
    fn clamps_out_of_range_offset() {
        let mut b = Buffer::from_text("abc");
        b.insert(999, "!");
        assert_eq!(b.text(), "abc!");
    }

    #[test]
    fn snapshot_on_multibyte_boundary() {
        let mut b = Buffer::from_text("héllo");
        b.insert(2, "X"); // byte 2 is inside 'é'
        assert_eq!(b.text(), "héXllo");
    }
}
