# What is an Agent Session?

## Overview

An **agent session** is a working context created when a GitHub Copilot agent is assigned to work on a task, issue, or pull request in a repository. During this session, the agent has access to the repository code, can make changes, run tests, and interact with various development tools.

## Key Characteristics

### 1. Session Scope
- Each agent session is isolated and focused on a specific task
- The agent works within a fresh clone of the repository
- Changes made during the session are committed to a dedicated branch

### 2. Session Context
- The agent has its own context window and memory for the duration of the session
- Context includes:
  - The problem statement or issue description
  - Repository structure and code
  - Previous actions taken during the session
  - Build/test results
  - User feedback and new requirements

### 3. Session Lifecycle
A typical agent session follows these stages:

1. **Initialization**: Agent receives the task and clones the repository
2. **Exploration**: Agent explores the codebase to understand the structure
3. **Planning**: Agent creates a plan and reports initial progress
4. **Implementation**: Agent makes targeted code changes
5. **Validation**: Agent runs tests, linters, and builds to verify changes
6. **Review**: Agent requests code review and addresses feedback
7. **Completion**: Agent finalizes changes and reports completion

## How Agent Sessions Work

### Working Environment
- Agent operates in a sandboxed environment
- Has access to repository files and can execute commands
- Can use tools like bash, file editors, git (read-only operations)
- Cannot directly push to GitHub (uses special tools to commit/push)

### Capabilities During a Session
The agent can:
- ✅ Read and modify files in the repository
- ✅ Run build commands, tests, and linters
- ✅ Search for code patterns and issues
- ✅ Make commits and push changes via `report_progress` tool
- ✅ Request code reviews
- ✅ Run security scans (CodeQL)
- ✅ Access limited internet resources

The agent cannot:
- ❌ Access files in `.github/agents` directory (instructions for other agents)
- ❌ Use `git push` directly (must use provided tools)
- ❌ Create new issues or PRs directly
- ❌ Access GitHub credentials directly
- ❌ Force push or rebase commits
- ❌ Share sensitive data with third-party systems

### Custom Agents
- Specialized agents can be available for specific tasks
- Custom agents are domain experts with specialized knowledge
- When available, tasks should be delegated to the appropriate custom agent
- Custom agents have their own isolated sessions and context

## Best Practices

### For Users Working with Agents
1. **Clear Problem Statements**: Provide clear, specific task descriptions
2. **Incremental Feedback**: Review progress reports and provide timely feedback
3. **New Requirements**: Clearly mark new requirements in conversations
4. **Trust the Process**: Allow agents to follow their workflow

### For Understanding Agent Behavior
1. Agents make minimal, surgical changes to code
2. Agents prioritize existing functionality and tests
3. Agents validate changes through testing and linting
4. Agents request reviews before finalizing work
5. Agents report progress incrementally

## Session vs. Conversation

| Aspect | Agent Session | Regular Conversation |
|--------|--------------|---------------------|
| Purpose | Complete a specific task | Answer questions, provide guidance |
| Code Access | Full repository access | No direct code access |
| Changes | Can commit and push | Cannot make commits |
| Duration | Task-focused, may span hours/days | Short-lived, minutes |
| Context | Maintains task context | Limited conversation history |
| Tools | Full development toolset | Limited to conversation tools |

## Example Agent Session Flow

```
1. User opens issue: "Add user authentication"
2. Agent session starts
3. Agent explores codebase
4. Agent reports initial plan
5. Agent implements authentication
6. Agent writes tests
7. Agent runs tests and linting
8. Agent commits changes
9. Agent requests code review
10. Agent addresses review feedback
11. Agent runs security scan
12. Agent reports completion
13. Session ends
```

## Monitoring Agent Sessions

You can monitor agent progress through:
- **Commits**: Check the commit history on the agent's branch
- **PR Updates**: Review pull request description updates
- **CI/CD Runs**: Observe automated test and build results
- **Code Review Comments**: Review automated code review feedback

## Conclusion

Agent sessions provide a structured, safe environment for AI-powered code changes. They enable automated development work while maintaining code quality through testing, review, and validation processes. Understanding how agent sessions work helps users collaborate effectively with GitHub Copilot agents.
