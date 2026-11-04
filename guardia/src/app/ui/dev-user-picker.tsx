"use client";

export function DevUserPicker({ current, users }: { current: string; users: { id: string; name: string }[] }) {
  return (
    <label className="devuser">
      Usuario
      <select
        defaultValue={current}
        onChange={async (e) => {
          await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: e.target.value }) });
          location.reload();
        }}
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
    </label>
  );
}
