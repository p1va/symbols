pub mod utils;

pub use utils::*;

/// A trait for string operations
pub trait StringProcessor {
    fn process(&self, input: &str) -> String;
}

/// Implementation for uppercase conversion
pub struct UpperCaseProcessor;

impl StringProcessor for UpperCaseProcessor {
    fn process(&self, input: &str) -> String {
        input.to_uppercase()
    }
}

/// Implementation for lowercase conversion
pub struct LowerCaseProcessor;

impl StringProcessor for LowerCaseProcessor {
    fn process(&self, input: &str) -> String {
        input.to_lowercase()
    }
}

/// Generic function that works with any StringProcessor
pub fn process_with<P: StringProcessor>(processor: &P, input: &str) -> String {
    processor.process(input)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_uppercase_processor() {
        let processor = UpperCaseProcessor;
        let result = processor.process("hello world");
        assert_eq!(result, "HELLO WORLD");
    }

    #[test]
    fn test_lowercase_processor() {
        let processor = LowerCaseProcessor;
        let result = processor.process("HELLO WORLD");
        assert_eq!(result, "hello world");
    }

    #[test]
    fn test_generic_processing() {
        let upper_processor = UpperCaseProcessor;
        let result = process_with(&upper_processor, "test");
        assert_eq!(result, "TEST");
    }
}