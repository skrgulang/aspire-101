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

function parts(value: string) {
  if (!value) return { date: '', time: '' };
  const [date = '', rawTime = ''] = value.split('T');
  return { date, time: rawTime.slice(0, 5) };
}

function combine(date: string, time: string) {
  if (!date || !time) return '';
  return `${date}T${time}`;
}

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function suggestedTime() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(Math.max(9, date.getHours() + 1));
  return date.toTimeString().slice(0, 5);
}

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
  const start = parts(startLocal);
  const end = parts(endLocal);

  function setStartDate(date: string) {
    const time = start.time || suggestedTime();
    onStartChange(combine(date, time));
    if (endLocal && end.date && end.date < date) onEndChange('');
  }

  function setStartTime(time: string) {
    onStartChange(combine(start.date || localDate(0), time));
  }

  function setEndDate(date: string) {
    const time = end.time || start.time || suggestedTime();
    onEndChange(combine(date, time));
  }

  function setEndTime(time: string) {
    onEndChange(combine(end.date || start.date || localDate(0), time));
  }

  function quickDate(days: number) {
    const date = localDate(days);
    const time = start.time || suggestedTime();
    onModeChange('scheduled');
    onStartChange(combine(date, time));
  }

  return (
    <section className={styles.card} aria-label="Request timing and meetup">
      <div className={styles.heading}>
        <div>
          <span>WHEN + WHERE</span>
          <h2>When should this happen?</h2>
        </div>
        <p>Keep it flexible, or add a time now. You can still change the plan together after connecting.</p>
      </div>

      <div className={styles.modeRow} role="group" aria-label="Timing preference">
        <button type="button" className={mode === 'flexible' ? styles.active : ''} onClick={() => onModeChange('flexible')}>
          <i>≈</i>
          <strong>Flexible</strong>
          <span>Figure it out in chat</span>
        </button>
        <button type="button" className={mode === 'scheduled' ? styles.active : ''} onClick={() => onModeChange('scheduled')}>
          <i>◷</i>
          <strong>Set a time</strong>
          <span>Add date + time</span>
        </button>
      </div>

      {mode === 'scheduled' && (
        <div className={styles.scheduleShell}>
          <div className={styles.quickDates}>
            <span>QUICK</span>
            <button type="button" onClick={() => quickDate(0)}>Today</button>
            <button type="button" onClick={() => quickDate(1)}>Tomorrow</button>
          </div>

          <div className={styles.timeGrid}>
            <div className={styles.timeCard}>
              <div className={styles.timeCardHead}><span>START</span><b>Required</b></div>
              <div className={styles.timeInputs}>
                <label><span>Date</span><input type="date" value={start.date} min={localDate(0)} onChange={(event) => setStartDate(event.target.value)} /></label>
                <label><span>Time</span><input type="time" value={start.time} onChange={(event) => setStartTime(event.target.value)} /></label>
              </div>
            </div>

            <div className={styles.timeCard}>
              <div className={styles.timeCardHead}><span>END</span><b className={styles.optional}>Optional</b></div>
              <div className={styles.timeInputs}>
                <label><span>Date</span><input type="date" value={end.date} min={start.date || localDate(0)} onChange={(event) => setEndDate(event.target.value)} /></label>
                <label><span>Time</span><input type="time" value={end.time} onChange={(event) => setEndTime(event.target.value)} /></label>
              </div>
              {endLocal && <button className={styles.clearEnd} type="button" onClick={() => onEndChange('')}>Clear end time</button>}
            </div>
          </div>
        </div>
      )}

      <label className={styles.placeField}>
        <div><span>MEETUP AREA</span><b>Optional</b></div>
        <input
          value={meetingLabel}
          maxLength={240}
          placeholder="PMU main entrance, State St, online…"
          onChange={(event) => onMeetingLabelChange(event.target.value)}
        />
        <small>Keep exact apartment or private addresses in the connection chat.</small>
      </label>

      <div className={styles.reminders}>
        <b>After you connect</b>
        <span>Countdown</span>
        <span>Change time</span>
        <span>On my way</span>
        <span>Arrived</span>
      </div>
    </section>
  );
}
