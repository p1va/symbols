package main

import (
	"fmt"
	"strings"
)

// StringHelper provides utility functions for string operations
type StringHelper struct{}

// ToUpperCase converts a string to uppercase
func (h *StringHelper) ToUpperCase(s string) string {
	return strings.ToUpper(s)
}

// Reverse reverses a string
func (h *StringHelper) Reverse(s string) string {
	runes := []rune(s)
	for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
		runes[i], runes[j] = runes[j], runes[i]
	}
	return string(runes)
}

// validateEmail checks if an email address is valid (basic validation)
func validateEmail(email string) bool {
	return strings.Contains(email, "@") && strings.Contains(email, ".")
}

// formatMessage creates a formatted message
func formatMessage(name, message string) string {
	return fmt.Sprintf("Hello %s: %s", name, message)
}