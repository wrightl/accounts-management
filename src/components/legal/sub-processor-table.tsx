import { SUB_PROCESSORS } from "@/lib/legal";

export function SubProcessorTable() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Sub-processors</caption>
        <thead className="bg-surface text-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">Provider</th>
            <th scope="col" className="px-4 py-3 font-semibold">What they do for Alfa</th>
            <th scope="col" className="px-4 py-3 font-semibold">Location</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-foreground/90">
          {SUB_PROCESSORS.map((p) => (
            <tr key={p.name}>
              <td className="px-4 py-3 align-top font-medium">{p.name}</td>
              <td className="px-4 py-3 align-top">{p.purpose}</td>
              <td className="px-4 py-3 align-top whitespace-nowrap">{p.location}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
