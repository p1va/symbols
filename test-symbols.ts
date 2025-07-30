// Test different symbol types
class MyClass {
  private value: number = 42;

  constructor(val: number) {
    this.value = val;
  }

  getValue(): number {
    return this.value;
  }
}

function helperFunction() {
  return 'helper';
}

const myInstance = new MyClass(100);
const result = myInstance.getValue();
