package task

// Test-only exports for the external task_test package. End-to-end tests
// that exercise a real adaptor must live outside package task: adaptor
// packages import this one, so importing them from an in-package test file
// would be an import cycle.
var PollOnceForTest = pollOnce
