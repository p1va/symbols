package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/gorilla/mux"
)

// User represents a user in the system
type User struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

// UserRepository handles user data operations
type UserRepository struct {
	users []User
}

// NewUserRepository creates a new user repository
func NewUserRepository() *UserRepository {
	return &UserRepository{
		users: []User{
			{ID: 1, Name: "Alice Johnson", Email: "alice@example.com"},
			{ID: 2, Name: "Bob Smith", Email: "bob@example.com"},
		},
	}
}

// GetUser retrieves a user by ID
func (r *UserRepository) GetUser(id int) (*User, error) {
	for _, user := range r.users {
		if user.ID == id {
			return &user, nil
		}
	}
	return nil, fmt.Errorf("user with ID %d not found", id)
}

// CreateUser adds a new user
func (r *UserRepository) CreateUser(user User) error {
	r.users = append(r.users, user)
	return nil
}

// calculateSum performs arithmetic operations
func calculateSum(a, b int) int {
	result := a + b
	return result
}

// processData demonstrates error handling
func processData(data []string) error {
	if len(data) == 0 {
		return fmt.Errorf("empty data slice")
	}
	
	for _, item := range data {
		fmt.Printf("Processing: %s\n", item)
	}
	return nil
}

func main() {
	repo := NewUserRepository()
	
	r := mux.NewRouter()
	
	r.HandleFunc("/users/{id}", func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]
		fmt.Fprintf(w, "User ID: %s", id)
	}).Methods("GET")
	
	log.Println("Server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}