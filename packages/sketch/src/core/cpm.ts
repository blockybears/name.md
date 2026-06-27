import type { GanttData, GanttTask } from './diagram'

// ---------------------------------------------------------------------------
// Critical Path Method (lightweight). Forward pass gives earliest start/finish
// (already encoded in each task's resolved start/end), the backward pass gives
// latest start/finish and total float. Zero-float tasks are the critical path.
// ---------------------------------------------------------------------------

export interface ScheduledTask {
  task: GanttTask
  index: number
  es: number
  ef: number
  ls: number
  lf: number
  float: number
  critical: boolean
}

export interface Schedule {
  tasks: ScheduledTask[]
  projectStart: number
  projectEnd: number
  /** Whether any dependency exists (float/critical are only meaningful then). */
  hasDependencies: boolean
}

const EPS = 1e-6

export function computeSchedule(gantt: GanttData): Schedule {
  const tasks = gantt.tasks
  const n = tasks.length
  const dur = (i: number) => Math.max(0, tasks[i].endDay - tasks[i].startDay)

  // Resolve dependency keys (a dep may reference a task name or id).
  const indexOf = new Map<string, number>()
  tasks.forEach((task, i) => {
    indexOf.set(task.name, i)
    if (task.id) {
      indexOf.set(task.id, i)
    }
  })
  const preds: number[][] = tasks.map((task) =>
    task.deps.map((d) => indexOf.get(d)).filter((x): x is number => x !== undefined),
  )
  const succs: number[][] = tasks.map(() => [])
  preds.forEach((ps, i) => ps.forEach((p) => succs[p].push(i)))
  const hasDependencies = preds.some((p) => p.length > 0)

  // Forward pass: ES = max(own resolved start, EF of predecessors).
  const es = new Array(n).fill(0)
  const ef = new Array(n).fill(0)
  const fdone = new Set<number>()
  const fpath = new Set<number>()
  const forward = (i: number): void => {
    if (fdone.has(i)) {
      return
    }
    if (fpath.has(i)) {
      // Cycle: fall back to the task's own resolved schedule.
      es[i] = tasks[i].startDay
      ef[i] = tasks[i].endDay
      fdone.add(i)
      return
    }
    fpath.add(i)
    let start = tasks[i].startDay
    for (const p of preds[i]) {
      forward(p)
      start = Math.max(start, ef[p])
    }
    es[i] = start
    ef[i] = start + dur(i)
    fpath.delete(i)
    fdone.add(i)
  }
  for (let i = 0; i < n; i += 1) {
    forward(i)
  }

  const projectStart = n ? Math.min(...es) : 0
  const projectEnd = n ? Math.max(...ef) : 0

  // Backward pass: LF = min(LS of successors), or project end if none.
  const lf = new Array(n).fill(projectEnd)
  const ls = new Array(n).fill(0)
  const bdone = new Set<number>()
  const bpath = new Set<number>()
  const backward = (i: number): void => {
    if (bdone.has(i)) {
      return
    }
    if (bpath.has(i)) {
      lf[i] = ef[i]
      ls[i] = es[i]
      bdone.add(i)
      return
    }
    bpath.add(i)
    let finish = succs[i].length ? Infinity : projectEnd
    for (const s of succs[i]) {
      backward(s)
      finish = Math.min(finish, ls[s])
    }
    if (!Number.isFinite(finish)) {
      finish = projectEnd
    }
    lf[i] = finish
    ls[i] = finish - dur(i)
    bpath.delete(i)
    bdone.add(i)
  }
  for (let i = 0; i < n; i += 1) {
    backward(i)
  }

  const scheduled: ScheduledTask[] = tasks.map((task, i) => {
    const float = ls[i] - es[i]
    return {
      task,
      index: i,
      es: es[i],
      ef: ef[i],
      ls: ls[i],
      lf: lf[i],
      float: Math.max(0, float),
      critical: hasDependencies && float <= EPS,
    }
  })

  return { tasks: scheduled, projectStart, projectEnd, hasDependencies }
}
