use std::fmt;

/// A custom error type for demonstration
#[derive(Debug)]
pub enum CustomError {
    InvalidInput(String),
    ProcessingFailed,
}

impl fmt::Display for CustomError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CustomError::InvalidInput(msg) => write!(f, "Invalid input: {}", msg),
            CustomError::ProcessingFailed => write!(f, "Processing failed"),
        }
    }
}

impl std::error::Error for CustomError {}

/// Utility function to reverse a string
pub fn reverse_string(input: &str) -> String {
    input.chars().rev().collect()
}

/// Utility function to count words in a string
pub fn count_words(input: &str) -> usize {
    input.split_whitespace().count()
}

/// Utility function that may return an error
pub fn safe_divide(a: f64, b: f64) -> Result<f64, CustomError> {
    if b == 0.0 {
        Err(CustomError::InvalidInput("Division by zero".to_string()))
    } else {
        Ok(a / b)
    }
}

/// A simple structure for demonstration
#[derive(Debug, Clone)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

impl Point {
    /// Creates a new point
    pub fn new(x: f64, y: f64) -> Self {
        Point { x, y }
    }

    /// Calculates the distance from origin
    pub fn distance_from_origin(&self) -> f64 {
        (self.x * self.x + self.y * self.y).sqrt()
    }

    /// Calculates the distance between two points
    pub fn distance_to(&self, other: &Point) -> f64 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        (dx * dx + dy * dy).sqrt()
    }
}

/// Demonstrates pattern matching
pub fn describe_number(n: i32) -> String {
    match n {
        0 => "Zero".to_string(),
        1..=10 => "Small positive number".to_string(),
        11..=100 => "Medium positive number".to_string(),
        101.. => "Large positive number".to_string(),
        _ => "Negative number".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reverse_string() {
        assert_eq!(reverse_string("hello"), "olleh");
    }

    #[test]
    fn test_count_words() {
        assert_eq!(count_words("hello world rust"), 3);
    }

    #[test]
    fn test_safe_divide() {
        assert_eq!(safe_divide(10.0, 2.0).unwrap(), 5.0);
        assert!(safe_divide(10.0, 0.0).is_err());
    }

    #[test]
    fn test_point_distance() {
        let p1 = Point::new(0.0, 0.0);
        let p2 = Point::new(3.0, 4.0);
        assert_eq!(p1.distance_to(&p2), 5.0);
    }
}