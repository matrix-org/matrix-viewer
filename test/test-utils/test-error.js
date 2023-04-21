// This is used to distinguish between an `AssertionError` within our app code from an
// `AssertionError` in the tests
class TestError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default TestError;
