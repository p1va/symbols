using System;

namespace TestProject
{
    /// <summary>
    /// Main program class for C# LSP testing
    /// Contains intentional issues for testing diagnostics
    /// </summary>
    class Program
    {
        /// <summary>
        /// Main entry point
        /// </summary>
        static void Main(string[] args)
        {
            Console.WriteLine("Hello from C# test project!");
            
            // Test C# diagnostics with intentional errors
            var undefinedVariable = someUndefinedVariable; // Compilation error
            var unusedVariable = 42; // Unused variable warning
            
            var service = new TestService();
            var result = service.ProcessData("test");
            
            Console.WriteLine($"Result: {result}");
            Console.WriteLine($"Value: {undefinedVariable}");
        }
    }
    
    /// <summary>
    /// Helper class for testing symbol inspection
    /// </summary>
    public class TestService
    {
        private string _data;
        
        /// <summary>
        /// Gets or sets the configuration name
        /// </summary>
        public string Name { get; set; } = "DefaultService";
        
        /// <summary>
        /// Process the input data
        /// </summary>
        /// <param name="input">Input data to process</param>
        /// <returns>Processed result</returns>
        public string ProcessData(string input)
        {
            _data = input?.ToUpper() ?? throw new ArgumentNullException(nameof(input));
            return $"Processed: {_data}";
        }
        
        /// <summary>
        /// Get the current data value
        /// </summary>
        /// <returns>Current data value</returns>
        public string GetData()
        {
            return _data ?? "No data";
        }
    }
}