import { HUMAN_HANDOFF_THRESHOLD } from '@poster-pilot/shared';

function App() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Poster Pilot</h1>
      <p className="text-sm text-gray-500">
        Human handoff threshold: {HUMAN_HANDOFF_THRESHOLD}
      </p>
    </div>
  );
}

export default App;
