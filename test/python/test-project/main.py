def main():
    print("Hello from test-project!")

    # Test Python diagnostics with intentional errors
    undefined_variable = some_undefined_var  # NameError
    unused_variable = 42  # Unused variable warning
    print(f"Value: {undefined_variable}")


if __name__ == "__main__":
    main()
