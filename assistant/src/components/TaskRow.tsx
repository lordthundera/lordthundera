import { useState } from 'react';
import { Icon, useToast } from './ui';
import { localizeDigits, relTime, formatJalaliShort, ymd } from '../lib/date';
import type { Priority, Task } from '../store/store';
import { effectiveDone, isOverdue, useApp } from '../store/store';
import { useActions } from './actions';

/* ============================================================================
   A task row shared by Today / Tasks / Calendar / Search results.
   ========================================================================== */

const REPEAT_LABEL: Record<string, string> = { daily: 'هر روز', weekly: 'هفتگی', monthly: 'ماهانه', weekdays: 'روزهای کار' };

export function TaskRow({
  task,
  onEdit,
  showProject = true,
  dense,
}: {
  task: Task;
  onEdit?: (t: Task) => void;
  showProject?: boolean;
  dense?: boolean;
}) {
  const { state, patch, remove } = useApp();
  const { go } = useActions();
  const push = useToast();
  const [open, setOpen] = useState(false);
  const done = effectiveDone(task);
  const overdue = isOverdue(task);
  const lang = state.settings.lang;
  const project = showProject && task.projectId ? state.collections.projects.find((p) => p.id === task.projectId) : undefined;
  const subDone = task.subtasks.filter((s) => s.done).length;

  const toggle = () => {
    patch('tasks', task.id, { done: !done, completedAt: !done ? new Date().toISOString() : undefined }, 'تغییر وضعیت');
    if (!done && task.repeat && task.repeat !== 'none') {
      // roll the next occurrence forward
      const step = task.repeat === 'daily' ? 1 : task.repeat === 'weekly' ? 7 : task.repeat === 'monthly' ? 30 : 1;
      const base = task.due ? new Date(task.due) : new Date();
      base.setDate(base.getDate() + step);
      if (task.repeat === 'weekdays') {
        do {
          base.setDate(base.getDate() + 1);
        } while ([0, 6].includes(base.getDay()));
      }
      patch('tasks', task.id, { done: false, completedAt: new Date().toISOString(), due: base.toISOString() }, 'تکرار خودکار');
      push(`↻ «${task.title}» برای ${formatJalaliShort(base)} دوباره در لیست می‌آید`);
    }
  };

  return (
    <div className={`list-item ${done ? 'done' : ''}`} style={{ padding: dense ? '8px 10px' : undefined }}>
      <button
        className={`tick ${done ? 'on' : ''}`}
        onClick={toggle}
        aria-label={done ? 'بازگردانی' : 'انجام شد'}
        title={done ? 'انجام شده' : 'انجام شد'}
      >
        <Icon name="check" size={13} />
      </button>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="row tight" style={{ alignItems: 'baseline' }}>
          <span className="title" style={{ cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
            {task.title}
          </span>
          {task.priority === 3 && !done ? <span className="chip p3">فوری</span> : null}
        </div>
        {(task.due || task.remindAt || task.tags.length || project || task.subtasks.length || task.notes) && (
          <div className="meta">
            {task.due ? (
              <span className={`chip ${overdue ? 'bad' : done ? 'ok' : ''}`}>
                <Icon name="calendar" size={12} />
                {done ? formatJalaliShort(task.due) : relTime(task.due, new Date(), lang)}
              </span>
            ) : null}
            {task.repeat && task.repeat !== 'none' ? <span className="chip">↻ {REPEAT_LABEL[task.repeat] ?? task.repeat}</span> : null}
            {task.subtasks.length ? (
              <span className="chip">
                ☑ {localizeDigits(`${subDone}/${task.subtasks.length}`, lang)}
              </span>
            ) : null}
            {project ? (
              <span className="chip" style={{ borderColor: project.color, color: project.color }}>
                <i style={{ width: 7, height: 7, borderRadius: 9, background: project.color, display: 'inline-block' }} />
                {project.name}
              </span>
            ) : null}
            {task.tags.map((t) => (
              <span key={t} className="chip tag">
                #{t}
              </span>
            ))}
            {task.priority === 1 ? <span className="chip p1">کم‌اهمیت</span> : null}
          </div>
        )}

        {open && (
          <div className="col" style={{ marginTop: 8, gap: 6 }}>
            {task.notes ? <div className="muted" style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{task.notes}</div> : null}
            {task.subtasks.length > 0 && (
              <div className="col" style={{ gap: 3 }}>
                {task.subtasks.map((s) => (
                  <label key={s.id} className="check" style={{ fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={s.done}
                      onChange={() =>
                        patch(
                          'tasks',
                          task.id,
                          {
                            subtasks: task.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)),
                          },
                          'زیرکار',
                        )
                      }
                    />
                    <span style={{ textDecoration: s.done ? 'line-through' : undefined, color: s.done ? 'var(--text-3)' : undefined }}>{s.title}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="row tight" style={{ marginTop: 4 }}>
              <button
                className="btn sm ghost"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  d.setHours(9, 0, 0, 0);
                  patch('tasks', task.id, { due: d.toISOString(), remindAt: d.toISOString(), notified: false }, 'تعجیق');
                  push('⏰ برای فردا ۹:۰۰ گذاشته شد');
                }}
              >
                ⏭ فردا
              </button>
              <button
                className="btn sm ghost"
                onClick={() => {
                  const d = new Date();
                  d.setHours(d.getHours() + 3, 0, 0, 0);
                  patch('tasks', task.id, { due: d.toISOString(), remindAt: d.toISOString(), notified: false }, 'تعجیق');
                  push('⏰ ۳ ساعت عقب افتاد');
                }}
              >
                💤 ۳ ساعت بعد
              </button>
              {task.due ? (
                <button className="btn sm ghost" onClick={() => patch('tasks', task.id, { due: undefined, remindAt: undefined }, 'پاک کردن زمان')} title="بدون زمان">
                  🗓 بدون زمان
                </button>
              ) : null}
              <span className="spacer" />
              {onEdit ? (
                <button className="icon-btn" title="ویرایش" onClick={() => onEdit(task)}>
                  <Icon name="pencil" size={15} />
                </button>
              ) : null}
              <button
                className="icon-btn"
                title="در تقویم"
                onClick={() => {
                  const start = task.due ? new Date(task.due) : new Date();
                  go('calendar', { day: ymd(start) });
                }}
              >
                <Icon name="calendar" size={15} />
              </button>
              <button
                className="icon-btn danger"
                title="حذف"
                onClick={() => {
                  remove('tasks', task.id, 'حذف کار');
                  push('🗑 حذف شد — با Ctrl+Z می‌توانی برگردانی', 'warn');
                }}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 9, background: PRIORITY_COLOR[task.priority], opacity: task.priority ? 1 : 0 }} />
    </div>
  );
}

export const PRIORITY_COLOR: Record<Priority, string> = {
  0: 'transparent',
  1: 'var(--info)',
  2: 'var(--warn)',
  3: 'var(--bad)',
};
