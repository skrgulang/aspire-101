import ActivitySubmissionNotice from '../ActivitySubmissionNotice';
import AppDock from '../AppDock';
import MyActivityManager from '../MyActivityManager';

export default function ActivityPage() {
  return (
    <main className="connectionsPage">
      <ActivitySubmissionNotice />
      <MyActivityManager />
      <AppDock active="activity" />
    </main>
  );
}
