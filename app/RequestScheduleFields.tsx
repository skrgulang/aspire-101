'use client';

import styles from './RequestScheduleFields.module.css';

export type RequestScheduleMode = 'flexible' | 'scheduled';

type Props = {
  mode: RequestScheduleMode;
  startLocal: string;
  endLocal: string;
  meetingLabel: string;
  onModeChange: (mode: RequestScheduleMode) => void;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onMeetingLabelChange: (value: string) => void;
};

export default function RequestScheduleFields({
  mode,
  startLocal,
  endLocal,
  meetingLabel,
  onModeChange,
  onStartChange,
  onEndChange,
  onMeetingLabelChange
}: Props) {
  return (
    <section className={styles.card} aria-label="Request timing and meetup">
      <div className={styles.heading}>
        <div>
          <span>WHEN + WHERE</span>
          <h2>Make the plan clear.</h2>
        </div>
        <p>Aspire can count down to an agreed time and keep later changes visible to both people.</p>
      </div>

      <div className={styles.modeRow} role="group" aria-label="Timing preference">
        <button type="button" className={mode === 'flexible' ? styles.active : ''} onClick={() => onModeChange('flexible')}>
          <strong>Flexible</strong>
          <span>Decide the exact time in chat.</span>
        </button>
        <button type="button" className={mode === 'scheduled' ? styles.active : ''} onClick={() => onModeChange('scheduled')}>
          <strong>Set a time</strong>
          <span>Add a date now so Aspire can show a countdown.</span>
        </button>
      </div>

      {mode === 'scheduled' && (
        <div className={styles.timeGrid}>
          <label>
            <span>Start · required</span>
            <input type="datetime-local" value={startLocal} onChange={(event) => onStartChange(event.target.value)} />
          </label>
          <label>
            <span>End · optional</span>
            <input type="datetime-local" value={endLocal} min={startLocal || undefined} onChange={(event) => onEndChange(event.target.value)} />
          </label>
        </div>
      )}

      <label className={styles.placeField}>
        <span>Approximate meetup place · optional</span>
        <input
          value={meetingLabel}
          maxLength={240}
          placeholder="e.g. PMU main entrance, Target on State St, online"
          onChange={(event) => onMeetingLabelChange(event.target.value)}
        />
        <small>Keep exact apartment or private addresses in the connection chat. Live location is always opt-in after you connect.</small>
      </label>

      <div className={styles.reminders}>
        <b>After you connect</b>
        <span>Countdown</span>
        <span>Change time</span>
        <span>On my way</span>
        <span>Arrived</span>
        <span>Optional location</span>
      </div>
    </section>
  );
}
