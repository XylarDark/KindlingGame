---
name: multi-agent-collaboration
description: Use when more than one agent or person is working in the same repository or the same working tree at the same time - covers single ownership of a file, staging by explicit path, who may push or rebase, establishing your own baseline before starting, and not changing a shared tool while others are using it.
---

# Multi-agent collaboration

Several agents in one repository is not a scaled-up version of one agent in one
repository. The failure modes are different, they are mostly invisible from inside a
single session, and almost all of them are cheaper to prevent than to unpick.

The governing idea: **an agent cannot see the other agents.** It sees a working tree
that changed for reasons it did not cause. Every rule below exists to keep that
situation legible.

## One file has exactly one owner

For the duration of a task, each file belongs to one agent. Ownership is assigned
before work starts, not negotiated after.

Overlapping edits are the failure. A merge conflict is the _lucky_ outcome, because
at least it stops you; the unlucky one is two agents each making a coherent change to
the same file and the last writer silently winning. If a task needs a file another
agent owns, that is a coordination request, not an edit.

When a task genuinely spans an owned file, say so and hand it back to whoever is
coordinating rather than editing around them.

## Stage by explicit path, never `git add -A`

```bash
git add path/to/one.file path/to/another.file    # correct
git add -A                                        # swallows everything in the tree
```

In a shared tree, `git add -A` and `git add .` will pick up other agents' in-flight
edits and any scratch file anyone happens to have on disk, and commit them under your
message. The resulting commit is unreviewable and misattributed, and the other agent
finds out when their work is already in history.

Stage the paths you changed. If you cannot list them, you do not yet know what you
changed.

## Do not commit changes you did not make

A shared working tree makes authorship ambiguous: file timestamps only prove _when_
something changed, and every concurrent agent shares that window. If you find a
modified file you do not recognize, **stop and report it** rather than committing it.
Committing someone's half-finished edit under your message is unrecoverable
attribution damage even though the content is fine.

The corollary is an obligation, not just a restriction: **commit your own work
promptly, in small coherent chunks**. Uncommitted work is unattributable work, and
the longer it sits in a shared tree the more likely someone else has to guess about
it.

## In a shared working tree, workers do not push and never rebase

When several agents share one checkout, history rewriting is the sharpest tool in the
room.

- **Never rebase.** A rebase rewrites commits underneath siblings who are holding
  uncommitted edits against the old history. That is how in-progress work is lost,
  and it is lost in a way that is hard to explain afterwards.
- **Do not push.** Centralize pushing with whoever is coordinating, so one party
  decides what goes public and when. A worker that pushes has published a state
  nobody reviewed on behalf of everyone sharing the tree.
- The same applies to `git reset --hard`, `git checkout -- .`, `git stash` of the
  whole tree, and `git clean`. Each one is fine in a private clone and destructive in
  a shared one.

Independent worktrees or clones remove most of this, and are worth the setup when the
work genuinely parallelizes. The rules above are for when they were not used.

## Establish your own baseline before you start

Record the state of the repository _before_ your first edit: the test count and pass
count, whether the type check is clean, whether the build succeeds, and which checks
were already failing.

Without a baseline, a sibling's transient breakage looks exactly like something you
just did, and the hour you spend proving otherwise is pure loss. With one, "this was
already red" is a fact rather than a hope.

State the baseline in your report alongside the final numbers. A reader can then see
what your change actually moved.

## Never modify a shared tool while others are using it

This one has cost real time more than once in a single session, in both directions.

A capture script, a build helper, a fixture generator, a lint config — anything
several agents invoke — must not be edited underneath its own users. When it changes
mid-flight, the resulting failure is **indistinguishable from the caller's own
changes**, so the caller debugs their innocent code instead.

- Sequence tool changes apart from tool use. Announce the change, land it, then let
  users resume.
- If a shared tool must change under load, make sure it fails **loudly** rather than
  hanging or silently behaving differently. A tool that errors with "this script was
  updated, re-run" costs a minute; one that quietly produces different output costs
  an afternoon.
- Treat the tool's command-line contract as an interface. Adding an option is safe;
  changing what an existing option means is not.

## Communicate through the repository, not through the session

Another agent cannot read your context window. Anything a sibling needs must exist as
a file: an entry in `docs/KNOWN_ERRORS.md`, a line in
`docs/operational/automation-gaps.md`, a note in the always-loaded context file, or a
commit message that says what changed and why.

If you discovered something the hard way and only wrote it in your report, the next
agent will discover it the hard way too.

## Checklist

- [ ] File ownership is clear before editing; no edits to files another agent owns
- [ ] Every commit stages explicit paths; no `git add -A` or `git add .`
- [ ] No modified file was committed whose authorship could not be confirmed
- [ ] Own work committed promptly in coherent chunks
- [ ] No rebase, reset, clean, or push from a worker in a shared tree
- [ ] A pre-work baseline was recorded and is stated in the report
- [ ] Shared tools were not edited while others were using them
- [ ] Durable findings written to a file, not just reported in the session
