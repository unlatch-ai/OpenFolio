"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CSVImport } from "@/components/csv-import";

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Import Contacts</h2>
        <p className="text-muted-foreground">
          Upload a CSV file to add people to your CRM
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CSV Import</CardTitle>
          <CardDescription>
            Map columns from your CSV to contact fields, then import in bulk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CSVImport />
        </CardContent>
      </Card>
    </div>
  );
}
