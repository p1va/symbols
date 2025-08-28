use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use anyhow::{Result, Context};

/// Represents a user in the system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: u32,
    pub name: String,
    pub email: String,
}

/// Repository for managing user data
#[derive(Debug)]
pub struct UserRepository {
    users: HashMap<u32, User>,
    next_id: u32,
}

impl UserRepository {
    /// Creates a new user repository with sample data
    pub fn new() -> Self {
        let mut users = HashMap::new();
        users.insert(1, User {
            id: 1,
            name: "Alice Johnson".to_string(),
            email: "alice@example.com".to_string(),
        });
        users.insert(2, User {
            id: 2,
            name: "Bob Smith".to_string(),
            email: "bob@example.com".to_string(),
        });

        UserRepository {
            users,
            next_id: 3,
        }
    }

    /// Retrieves a user by ID
    pub fn get_user(&self, id: u32) -> Option<&User> {
        self.users.get(&id)
    }

    /// Creates a new user
    pub fn create_user(&mut self, name: String, email: String) -> Result<&User> {
        let user = User {
            id: self.next_id,
            name,
            email,
        };
        
        self.users.insert(self.next_id, user);
        let created_user = self.users.get(&self.next_id).unwrap();
        self.next_id += 1;
        
        Ok(created_user)
    }

    /// Updates an existing user
    pub fn update_user(&mut self, id: u32, name: Option<String>, email: Option<String>) -> Result<&User> {
        let user = self.users.get_mut(&id)
            .context("User not found")?;
        
        if let Some(name) = name {
            user.name = name;
        }
        if let Some(email) = email {
            user.email = email;
        }
        
        Ok(user)
    }

    /// Deletes a user by ID
    pub fn delete_user(&mut self, id: u32) -> Result<User> {
        self.users.remove(&id)
            .context("User not found")
    }

    /// Lists all users
    pub fn list_users(&self) -> Vec<&User> {
        self.users.values().collect()
    }
}

/// Calculates the sum of two numbers
pub fn calculate_sum(a: i32, b: i32) -> i32 {
    a + b
}

/// Validates an email address (basic validation)
pub fn validate_email(email: &str) -> bool {
    email.contains('@') && email.contains('.')
}

/// Processes a list of strings
pub fn process_data(data: &[String]) -> Result<Vec<String>> {
    if data.is_empty() {
        return Err(anyhow::anyhow!("Empty data slice"));
    }
    
    let processed: Vec<String> = data
        .iter()
        .map(|item| format!("Processed: {}", item))
        .collect();
        
    Ok(processed)
}

#[tokio::main]
async fn main() -> Result<()> {
    println!("Starting Rust test application...");
    
    let mut repo = UserRepository::new();
    
    // Demonstrate repository operations
    println!("Users: {:?}", repo.list_users());
    
    let new_user = repo.create_user(
        "Charlie Brown".to_string(),
        "charlie@example.com".to_string(),
    )?;
    println!("Created user: {:?}", new_user);
    
    // Demonstrate utility functions
    let sum = calculate_sum(10, 20);
    println!("Sum: {}", sum);
    
    let email_valid = validate_email("test@example.com");
    println!("Email valid: {}", email_valid);
    
    let data = vec![
        "item1".to_string(),
        "item2".to_string(),
        "item3".to_string(),
    ];
    let processed = process_data(&data)?;
    println!("Processed data: {:?}", processed);
    
    Ok(())
}