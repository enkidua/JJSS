export interface FollowUpTask {
    id: string;
    title: string;
    dueDate: string;
    done: boolean;
}

export interface GoalCheckIn {
    id: string;
    date: string;
    note: string;
}

export interface RehabGoal {
    id: string;
    title: string;
    baseline: string;
    target: string;
    checkIns: GoalCheckIn[];
}

export interface RehabWorkflowData {
    version: 1;
    tasks: FollowUpTask[];
    goals: RehabGoal[];
}

export const EMPTY_REHAB_WORKFLOW: RehabWorkflowData = { version: 1, tasks: [], goals: [] };

const isText = (value: unknown): value is string => typeof value === 'string';
const isDate = (value: unknown): value is string => isText(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** 손상된 기록을 빈 기록으로 간주해 덮어쓰지 않도록 null을 반환합니다. */
export function parseRehabWorkflow(content: string): RehabWorkflowData | null {
    try {
        const value = JSON.parse(content);
        if (!value || value.version !== 1 || !Array.isArray(value.tasks) || !Array.isArray(value.goals)) return null;
        const tasks = value.tasks.map((task: FollowUpTask) => {
            if (!task || !isText(task.id) || !isText(task.title) || !isDate(task.dueDate) || typeof task.done !== 'boolean') throw new Error('Invalid task');
            return { id: task.id, title: task.title, dueDate: task.dueDate, done: task.done };
        });
        const goals = value.goals.map((goal: RehabGoal) => {
            if (!goal || !isText(goal.id) || !isText(goal.title) || !isText(goal.baseline) || !isText(goal.target) || !Array.isArray(goal.checkIns)) throw new Error('Invalid goal');
            const checkIns = goal.checkIns.map((entry: GoalCheckIn) => {
                if (!entry || !isText(entry.id) || !isDate(entry.date) || !isText(entry.note)) throw new Error('Invalid check-in');
                return { id: entry.id, date: entry.date, note: entry.note };
            });
            return { id: goal.id, title: goal.title, baseline: goal.baseline, target: goal.target, checkIns };
        });
        return { version: 1, tasks, goals };
    } catch {
        return null;
    }
}

export function localDateKey(date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getTaskTiming(dueDate: string, today: string): 'overdue' | 'today' | 'upcoming' | 'later' {
    if (dueDate < today) return 'overdue';
    if (dueDate === today) return 'today';
    const limit = new Date(`${today}T12:00:00`);
    limit.setDate(limit.getDate() + 7);
    return dueDate <= localDateKey(limit) ? 'upcoming' : 'later';
}
