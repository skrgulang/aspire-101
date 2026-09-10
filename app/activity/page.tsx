import AppDock from '../AppDock';
import MyActivityManager from '../MyActivityManager';

export default function ActivityPage() {
  return (
    <main className="connectionsPage">
      <MyActivityManager />
      <AppDock active="activity" />
    </main>
  );
}
