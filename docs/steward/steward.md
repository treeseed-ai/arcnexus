
Pending host operations return an initial progress reference promptly.
`execution.wait` then waits for that same operation to finish, under the configured
MCP protocol ceiling, rather than repeatedly returning one-second observations.
The steward must receive the completed result before ending a turn that depends
on it. Cancellation and bridge-loss shutdown remain active while waiting.
