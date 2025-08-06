// Simple test file for rename functionality
function newName(param) {
  const result = newName('test');
  return result + param;
}

export const someVar = newName('hello');

class TestClass {
  oldMethodName() {
    return newName('method call');
  }
  
  callMethod() {
    return this.oldMethodName();  
  }
}