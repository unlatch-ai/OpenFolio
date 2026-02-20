"use client";

import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { CSVAnalyzeResponse, CSVColumnMapping, CSVProcessResponse } from "@/types";

const CSV_STEPS = [
  { id: 1, label: "Upload" },
  { id: 2, label: "Map Columns" },
  { id: 3, label: "Import" },
  { id: 4, label: "Done" },
];

// System fields that can be mapped
const SYSTEM_FIELDS = [
  { value: "email", label: "Email (required)", required: true },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
];

export function CSVImport() {
  const [currentStep, setCurrentStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Analyze result
  const [analyzeResult, setAnalyzeResult] = useState<CSVAnalyzeResponse | null>(null);
  const [mappings, setMappings] = useState<CSVColumnMapping[]>([]);

  // Process result
  const [processResult, setProcessResult] = useState<CSVProcessResponse | null>(null);
  const [showAllErrors, setShowAllErrors] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.endsWith(".csv")) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError("Please select a CSV file");
        setFile(null);
      }
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith(".csv")) {
        setFile(droppedFile);
        setError(null);
      } else {
        setError("Please drop a CSV file");
        setFile(null);
      }
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleAnalyze = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/import/csv/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Analysis failed");
      }

      setUploadId(data.upload_id);
      setAnalyzeResult(data);
      setMappings(data.suggested_mappings);
      setCurrentStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsUploading(false);
    }
  };

  const updateMapping = (csvColumn: string, mapsTo: string) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.csv_column === csvColumn
          ? {
              ...m,
              maps_to: mapsTo,
              is_system_field: SYSTEM_FIELDS.some((sf) => sf.value === mapsTo),
            }
          : m
      )
    );
  };

  const handleProcess = async () => {
    if (!uploadId || mappings.length === 0) return;

    // Validate email mapping exists
    const hasEmail = mappings.some((m) => m.maps_to === "email");
    if (!hasEmail) {
      setError("Please map at least one column to Email");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setCurrentStep(3);

    try {
      // Queue the import job
      const response = await fetch("/api/import/csv/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_id: uploadId, mappings }),
      });

      const queued = await response.json();
      if (!response.ok) {
        throw new Error((queued as { error?: string }).error || "Import failed");
      }

      // Poll for completion
      const POLL_INTERVAL_MS = 2500;
      const MAX_POLLS = 240; // 10 minutes max
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

        const statusRes = await fetch(`/api/import/status/${uploadId}`);
        const statusData = await statusRes.json();

        if (!statusRes.ok) {
          throw new Error(statusData.error || "Failed to check import status");
        }

        if (statusData.status === "completed") {
          const result = (statusData.result ?? {}) as {
            people_created?: number;
            people_updated?: number;
            errors?: string[];
          };
          const processResult: CSVProcessResponse = {
            success: true,
            people_created: result.people_created ?? 0,
            people_updated: result.people_updated ?? 0,
            errors: result.errors ?? [],
          };
          setProcessResult(processResult);
          setShowAllErrors(false);
          setCurrentStep(4);
          toast.success(
            `Imported ${processResult.people_created} new people, updated ${processResult.people_updated}`
          );
          return;
        }

        if (statusData.status === "failed") {
          const errMsg =
            (statusData.result as { error?: string })?.error ?? "Import failed";
          throw new Error(errMsg);
        }
      }

      throw new Error("Import timed out — check back later");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setCurrentStep(2);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetImport = () => {
    setCurrentStep(1);
    setFile(null);
    setUploadId(null);
    setAnalyzeResult(null);
    setMappings([]);
    setProcessResult(null);
    setShowAllErrors(false);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center justify-between">
        {CSV_STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium",
                currentStep > step.id && "bg-green-600 text-white",
                currentStep === step.id && "bg-primary text-primary-foreground",
                currentStep < step.id && "bg-secondary text-muted-foreground"
              )}
            >
              {currentStep > step.id ? <CheckCircle className="w-5 h-5" /> : step.id}
            </div>
            <span
              className={cn(
                "ml-2 text-sm font-medium",
                currentStep >= step.id ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
            {index < CSV_STEPS.length - 1 && (
              <div
                className={cn(
                  "w-16 h-0.5 mx-4",
                  currentStep > step.id ? "bg-green-600" : "bg-secondary"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-destructive" />
          <p className="text-destructive">{error}</p>
        </div>
      )}

      {/* Step 1: Upload */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload People CSV</CardTitle>
            <CardDescription>
              Upload a CSV file containing your people. The file should have an email column.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-12 text-center transition-colors",
                file
                  ? "border-green-400 bg-green-50 dark:bg-green-950/20"
                  : "border-border hover:border-primary/50"
              )}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              {file ? (
                <div className="space-y-2">
                  <FileSpreadsheet className="mx-auto h-12 w-12 text-green-600" />
                  <p className="text-lg font-medium text-foreground">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <>
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium text-foreground mb-1">
                    Drop your CSV file here
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">or click to browse files</p>
                </>
              )}
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                id="csv-upload"
              />
              <Label htmlFor="csv-upload">
                <Button variant="outline" type="button" asChild>
                  <span>Browse Files</span>
                </Button>
              </Label>
            </div>

            <div className="flex items-center justify-between pt-4">
              <div className="text-sm text-muted-foreground">
                <p>Supported format: CSV files with headers</p>
                <p>Tip: Export from Airtable, Google Sheets, or Excel</p>
              </div>
              <Button onClick={handleAnalyze} disabled={!file || isUploading}>
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    Analyze CSV
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Map Columns */}
      {currentStep === 2 && analyzeResult && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Map Columns</CardTitle>
                <CardDescription>
                  Map your CSV columns to people fields. Columns not mapped will be stored as
                  custom data.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-sm">
                {analyzeResult.row_count} rows
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Column Mapping Table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/3">CSV Column</TableHead>
                    <TableHead className="w-1/3">Maps To</TableHead>
                    <TableHead>Sample Values</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.map((mapping) => (
                    <TableRow key={mapping.csv_column}>
                      <TableCell className="font-medium">{mapping.csv_column}</TableCell>
                      <TableCell>
                        <Select
                          value={mapping.maps_to}
                          onValueChange={(value) => updateMapping(mapping.csv_column, value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">-- Skip this column --</SelectItem>
                            {SYSTEM_FIELDS.map((field) => (
                              <SelectItem key={field.value} value={field.value}>
                                {field.label}
                              </SelectItem>
                            ))}
                            {/* Show the current custom mapping if it's not a system field */}
                            {!SYSTEM_FIELDS.some((sf) => sf.value === mapping.maps_to) &&
                              mapping.maps_to !== "skip" && (
                                <SelectItem value={mapping.maps_to}>
                                  Custom: {mapping.maps_to}
                                </SelectItem>
                              )}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {analyzeResult.sample_rows
                          .slice(0, 2)
                          .map((row) => row[mapping.csv_column])
                          .filter(Boolean)
                          .join(", ")
                          .slice(0, 50)}
                        {analyzeResult.sample_rows[0]?.[mapping.csv_column]?.length > 50 && "..."}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Preview */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">Preview (first 3 rows)</h3>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {mappings
                        .filter((m) => m.maps_to !== "skip")
                        .slice(0, 5)
                        .map((m) => (
                          <TableHead key={m.csv_column}>{m.maps_to}</TableHead>
                        ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analyzeResult.sample_rows.slice(0, 3).map((row, i) => (
                      <TableRow key={i}>
                        {mappings
                          .filter((m) => m.maps_to !== "skip")
                          .slice(0, 5)
                          .map((m) => (
                            <TableCell key={m.csv_column} className="text-sm">
                              {row[m.csv_column]?.slice(0, 30)}
                              {row[m.csv_column]?.length > 30 && "..."}
                            </TableCell>
                          ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={resetImport}>
                Cancel
              </Button>
              <Button onClick={handleProcess} disabled={isProcessing}>
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    Import {analyzeResult.row_count} People
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Processing */}
      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Importing People</CardTitle>
            <CardDescription>Processing your CSV and creating people records...</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
            <p className="text-center text-muted-foreground">
              This may take a moment depending on the file size...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Done */}
      {currentStep === 4 && processResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-green-600" />
              Import Complete
            </CardTitle>
            <CardDescription>Your people have been successfully imported</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-green-700 dark:text-green-400">
                  {processResult.people_created}
                </p>
                <p className="text-sm text-green-600 dark:text-green-500">New People</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-blue-700 dark:text-blue-400">
                  {processResult.people_updated}
                </p>
                <p className="text-sm text-blue-600 dark:text-blue-500">Updated People</p>
              </div>
            </div>

            {processResult.errors.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    {processResult.errors.length} rows had issues:
                  </p>
                  {processResult.errors.length > 5 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-yellow-800 dark:text-yellow-200"
                      onClick={() => setShowAllErrors((prev) => !prev)}
                    >
                      {showAllErrors
                        ? "Hide errors"
                        : `Show all (${processResult.errors.length})`}
                    </Button>
                  )}
                </div>
                <ul
                  className={cn(
                    "text-sm text-yellow-700 dark:text-yellow-300 list-disc list-inside",
                    showAllErrors && processResult.errors.length > 8 && "max-h-64 overflow-auto"
                  )}
                >
                  {(showAllErrors ? processResult.errors : processResult.errors.slice(0, 5)).map(
                    (err, i) => (
                      <li key={i}>{err}</li>
                    )
                  )}
                </ul>
              </div>
            )}

            <div className="flex justify-center gap-3 pt-4">
              <Button variant="outline" onClick={resetImport}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Import Another File
              </Button>
              <Button onClick={() => (window.location.href = "/app/people")}>View People</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
