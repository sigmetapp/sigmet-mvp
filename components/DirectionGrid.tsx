'use client';

const DIRECTIONS = [
  'Health','Career','Learning','Finance','Family','Community',
  'Mindfulness','Creativity','Sport','Travel','Ethics','Digital Hygiene'
];

export default function DirectionGrid(){
  return (
    <div className="card">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {DIRECTIONS.map(d => (
          <div key={d} className="p-3 rounded border border-white/10 text-center">{d}</div>
        ))}
      </div>
    </div>
  );
}
