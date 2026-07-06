'use client';

import { useEffect, useState } from 'react';
import {
  createActivity,
  fetchActivityOptions,
  type Activity,
  type ActivityAssignee,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { useDialogA11y } from '@/lib/useDialogA11y';

interface AddActivityDialogProps {
  enrollmentId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (activity: Activity) => void;
}

const PRIORITY_OPTIONS = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * New Activity dialog. Loads the enrollment's selectable events and assignees,
 * defaults the event to the enrollment's current event, and creates a PENDING
 * activity. Only fields backed by real worklist_items columns are collected.
 */
export default function AddActivityDialog({
  enrollmentId,
  open,
  onClose,
  onCreated,
}: AddActivityDialogProps) {
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [assignees, setAssignees] = useState<ActivityAssignee[]>([]);

  const [eventId, setEventId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [dueDate, setDueDate] = useState(today());

  const [optionsLoading, setOptionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load options each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const token = getToken();
    setEventId('');
    setAssignedTo('');
    setPriority('NORMAL');
    setDueDate(today());
    setError('');
    if (!token) return;

    let active = true;
    setOptionsLoading(true);
    fetchActivityOptions(token, enrollmentId)
      .then((opts) => {
        if (!active) return;
        setEvents(opts.events);
        setAssignees(opts.assignees);
        const defaultEvent =
          (opts.defaultEventId && opts.events.find((e) => e.id === opts.defaultEventId)?.id) ??
          opts.events[0]?.id ??
          '';
        setEventId(defaultEvent);
        setOptionsLoading(false);
      })
      .catch(() => {
        if (active) {
          setError('Unable to load activity options.');
          setOptionsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [open, enrollmentId]);

  // Shared dialog behaviour: Escape close, focus trap, focus restore (M35C).
  const dialogRef = useDialogA11y(open, () => {
        if (!saving) onClose();
      });

  if (!open) return null;

  const canSave = !!eventId && !!dueDate && !saving;

  async function handleSave() {
    if (saving) return;
    setError('');
    if (!eventId || !dueDate) {
      setError('Please select an event and a due date.');
      return;
    }
    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }

    setSaving(true);
    try {
      const created = await createActivity(token, enrollmentId, {
        eventId,
        dueDate,
        assignedTo: assignedTo || undefined,
        priority,
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create activity.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="modal"
        ref={dialogRef} role="dialog"
        aria-modal="true"
        aria-labelledby="add-activity-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="add-activity-title" className="modal-title">New Activity</h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={onClose}
            disabled={saving}
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}

          <div className="fg">
            <label className="fl" htmlFor="aa-event">Event *</label>
            <select
              id="aa-event"
              className="fc"
              value={eventId}
              disabled={optionsLoading || saving}
              onChange={(e) => setEventId(e.target.value)}
            >
              <option value="">
                {optionsLoading
                  ? 'Loading…'
                  : events.length === 0
                    ? 'No events available'
                    : 'Select an event'}
              </option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>

          <div className="fg">
            <label className="fl" htmlFor="aa-assignee">Assignee</label>
            <select
              id="aa-assignee"
              className="fc"
              value={assignedTo}
              disabled={saving}
              onChange={(e) => setAssignedTo(e.target.value)}
            >
              <option value="">Unassigned</option>
              {assignees.map((a) => (
                <option key={a.username} value={a.username}>
                  {a.fullName} ({a.username})
                </option>
              ))}
            </select>
          </div>

          <div className="modal-row">
            <div className="fg">
              <label className="fl" htmlFor="aa-priority">Priority</label>
              <select
                id="aa-priority"
                className="fc"
                value={priority}
                disabled={saving}
                onChange={(e) => setPriority(e.target.value)}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="fg">
              <label className="fl" htmlFor="aa-date">Due Date *</label>
              <input
                id="aa-date"
                type="date"
                className="fc"
                value={dueDate}
                disabled={saving}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!canSave}>
            {saving ? 'Saving…' : 'Create Activity'}
          </button>
        </div>
      </div>
    </div>
  );
}
