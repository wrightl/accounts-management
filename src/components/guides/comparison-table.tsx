export function ComparisonTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="py-3 pr-4 text-left font-semibold text-foreground">
              Requirement
            </th>
            <th className="px-4 py-3 text-left font-semibold text-foreground">
              Limited Company
            </th>
            <th className="px-4 py-3 text-left font-semibold text-foreground">
              Sole Trader
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          <tr>
            <td className="py-3 pr-4 text-foreground/90">Registration</td>
            <td className="px-4 py-3 text-foreground/90">Companies House</td>
            <td className="px-4 py-3 text-foreground/90">HMRC Self Assessment</td>
          </tr>
          <tr>
            <td className="py-3 pr-4 text-foreground/90">Tax return</td>
            <td className="px-4 py-3 text-foreground/90">Corporation Tax (CT600)</td>
            <td className="px-4 py-3 text-foreground/90">Self Assessment (SA100)</td>
          </tr>
          <tr>
            <td className="py-3 pr-4 text-foreground/90">Annual accounts</td>
            <td className="px-4 py-3 text-foreground/90">
              Required (filed with Companies House)
            </td>
            <td className="px-4 py-3 text-foreground/90">
              Not required (unless turnover over £150k)
            </td>
          </tr>
          <tr>
            <td className="py-3 pr-4 text-foreground/90">Record keeping</td>
            <td className="px-4 py-3 text-foreground/90">Minimum 6 years</td>
            <td className="px-4 py-3 text-foreground/90">
              Minimum 5 years after filing deadline
            </td>
          </tr>
          <tr>
            <td className="py-3 pr-4 text-foreground/90">Tax rates</td>
            <td className="px-4 py-3 text-foreground/90">
              Corporation Tax (19-25%)
            </td>
            <td className="px-4 py-3 text-foreground/90">
              Income Tax (20-45%) + NI (Class 2 & 4)
            </td>
          </tr>
          <tr>
            <td className="py-3 pr-4 text-foreground/90">Personal liability</td>
            <td className="px-4 py-3 text-foreground/90">Limited</td>
            <td className="px-4 py-3 text-foreground/90">Unlimited</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
