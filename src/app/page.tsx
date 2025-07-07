"use client";

import { useState, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileSpreadsheet, Filter, Clock, User, Calendar } from "lucide-react";

interface EmployeeRecord {
  id: number;
  logDate: string;
  direction: string;
  employeeCode: string;
  employeeName: string;
  company: string;
  department: string;
}

interface TimeGapData {
  employeeName: string;
  employeeCode: string;
  firstTime: string;
  lastTime: string;
  totalGap: string;
  recordCount: number;
}

export default function Home() {
  const [data, setData] = useState<EmployeeRecord[]>([]);
  const [filteredData, setFilteredData] = useState<EmployeeRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState("");

  // Excel file upload handler
  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // 1) pull the sheet into a 2D array
      const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
        header: 1,
        blankrows: false,
        defval: "",
      });

      // 2) find the header row index by looking for "Log Date"
      const headerRowIndex = rows.findIndex((r) =>
        r.some((cell) => typeof cell === "string" && cell.trim() === "Log Date")
      );
      if (headerRowIndex < 0) {
        console.error('Could not find a "Log Date" header in the sheet!');
        return;
      }

      // 3) extract the real headers, trimmed
      const headers: string[] = (rows[headerRowIndex] as string[]).map((h) =>
        typeof h === "string" ? h.trim() : String(h)
      );

      // 4) now re-parse the sheet into JSON, telling it to
      //    – use our trimmed headers
      //    – skip everything above headerRowIndex
      //    – fill empty cells with ''
      const jsonData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
        header: headers,
        range: headerRowIndex,
        defval: "",
      });

      // 5) map into your typed records exactly as before
      const processedData: EmployeeRecord[] = jsonData.map((row, i) => ({
        id: i + 1,
        logDate: String(row["Log Date"] || ""),
        direction: String(row["Direction"] || ""),
        employeeCode: String(row["Employee Code"] || ""),
        employeeName: String(row["Employee Name"] || ""),
        company: String(row["Company"] || ""),
        department: String(row["Department"] || ""),
      }));

      setData(processedData);
      setFilteredData(processedData);

      // reset any existing filters
      setSelectedDate("");
      setSelectedEmployee("");
      setSelectedEmployeeCode("");
    };
    reader.readAsArrayBuffer(file);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-excel": [".xls"],
    },
    multiple: false,
  });

  // Get unique values for filters
  const uniqueDates = useMemo(() => {
    const dates = [
      ...new Set(
        data.map((item) => {
          if (item.logDate) {
            try {
              return item.logDate.split(" ")[0]; // Extract date part
            } catch {
              return "";
            }
          }
          return "";
        })
      ),
    ].filter(Boolean);
    return dates.sort();
  }, [data]);

  const uniqueEmployees = useMemo(() => {
    return [...new Set(data.map((item) => item.employeeName))]
      .filter(Boolean)
      .sort();
  }, [data]);

  const uniqueEmployeeCodes = useMemo(() => {
    return [...new Set(data.map((item) => item.employeeCode))]
      .filter(Boolean)
      .sort();
  }, [data]);

  // Calculate time gaps for filtered data
  const timeGapData = useMemo((): TimeGapData[] => {
    if (!filteredData.length) return [];

    // Filter out records that don't match the selected date
    const filteredByDate = selectedDate
      ? filteredData.filter((item) => item.logDate.includes(selectedDate))
      : filteredData;

    // Toss out any row whose employeeCode is not all digits
    const validRecords = filteredByDate.filter((r) =>
      /^\d+$/.test(r.employeeCode)
    );

    // Group by employee and date
    const groupedByEmployeeAndDate = validRecords.reduce((acc, record) => {
      const key = `${record.employeeName}-${record.employeeCode}-${
        record.logDate.split(" ")[0]
      }`; // Group by employee and date
      if (!acc[key]) acc[key] = [];
      acc[key].push(record);
      return acc;
    }, {} as Record<string, EmployeeRecord[]>);

    return Object.entries(groupedByEmployeeAndDate).map(([key, records]) => {
      const [employeeName, employeeCode] = key.split("-");

      // Sort records by logDate for accurate gap calculation
      const sortedRecords = records.sort((a, b) => {
        const dateA = new Date(
          a.logDate.replace(/(\d{2})-(\w{3})-(\d{4})/, "$3-$2-$1")
        );
        const dateB = new Date(
          b.logDate.replace(/(\d{2})-(\w{3})-(\d{4})/, "$3-$2-$1")
        );
        return dateA.getTime() - dateB.getTime();
      });

      // If there's only one record, no time gap can be calculated
      if (sortedRecords.length < 2) {
        return {
          employeeName,
          employeeCode,
          firstTime: sortedRecords[0]?.logDate || "",
          lastTime: sortedRecords[0]?.logDate || "",
          totalGap: "0h 0m 0s",
          recordCount: sortedRecords.length,
        };
      }

      // Calculate time gap between first and last log entry for the date
      const firstRecord = sortedRecords[0];
      const lastRecord = sortedRecords[sortedRecords.length - 1];

      // Parse dates for calculation
      const parseDateTime = (dateStr: string) => {
        try {
          const [datePart, timePart] = dateStr.split(" ");
          const [day, month, year] = datePart.split("-");
          const monthMap: Record<string, string> = {
            Jan: "01",
            Feb: "02",
            Mar: "03",
            Apr: "04",
            May: "05",
            Jun: "06",
            Jul: "07",
            Aug: "08",
            Sep: "09",
            Oct: "10",
            Nov: "11",
            Dec: "12",
          };
          const formattedDate = `${year}-${monthMap[month]}-${day}T${timePart}`;
          return new Date(formattedDate);
        } catch {
          return new Date();
        }
      };

      const firstTime = parseDateTime(firstRecord.logDate);
      const lastTime = parseDateTime(lastRecord.logDate);
      const diffInSeconds = Math.abs(
        (lastTime.getTime() - firstTime.getTime()) / 1000
      );

      const hours = Math.floor(diffInSeconds / 3600);
      const minutes = Math.floor((diffInSeconds % 3600) / 60);
      const seconds = Math.floor(diffInSeconds % 60);

      return {
        employeeName,
        employeeCode,
        firstTime: firstRecord.logDate,
        lastTime: lastRecord.logDate,
        totalGap: `${hours}h ${minutes}m ${seconds}s`,
        recordCount: sortedRecords.length,
      };
    });
  }, [filteredData, selectedDate]);


  // Apply filters
  const applyFilters = () => {
    let filtered = data;

    if (selectedDate) {
      filtered = filtered.filter((item) => item.logDate.includes(selectedDate));
    }

    if (selectedEmployee) {
      filtered = filtered.filter(
        (item) => item.employeeName === selectedEmployee
      );
    }

    if (selectedEmployeeCode) {
      filtered = filtered.filter(
        (item) => item.employeeCode === selectedEmployeeCode
      );
    }

    setFilteredData(filtered);
  };

  // Clear filters
  const clearFilters = () => {
    setSelectedDate("");
    setSelectedEmployee("");
    setSelectedEmployeeCode("");
    setFilteredData(data);
  };

  const handleExport = () => {
    const exportData = timeGapData.map((item) => {
      const [date, inTime] = item.firstTime.split(" ");
      const outTime = item.lastTime.split(" ")[1] || "";

      return {
        "Employee Name": item.employeeName,
        "Employee Code": item.employeeCode,
        Date: date,
        "In Time": inTime,
        "Out Time": outTime,
        "Total Gap": item.totalGap,
        "Record Count": item.recordCount,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Time Gap Summary");

    XLSX.writeFile(workbook, "time_gap_summary.xlsx");
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center py-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Employee Time Tracking Dashboard
          </h1>
        </div>

        {/* File Upload Section */}
        {data.length === 0 && (
          <Card className="border-dashed border-2 border-gray-300">
            <CardContent className="p-8">
              <div
                {...getRootProps()}
                className={`text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? "bg-blue-50 border-blue-300"
                    : "hover:bg-gray-50"
                } border-2 border-dashed border-gray-300 rounded-lg p-8`}
              >
                <input {...getInputProps()} />
                <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <div className="space-y-2">
                  <p className="text-lg font-medium text-gray-900">
                    {isDragActive
                      ? "Drop the Excel file here"
                      : "Upload Excel File"}
                  </p>
                  <p className="text-gray-500">
                    Drag and drop your Excel file here, or click to select
                  </p>
                  <p className="text-sm text-gray-400">
                    Supports .xlsx and .xls files
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dashboard Content */}
        {data.length > 0 && (
          <>
            {/* Filters Section */}
            <Card className="">
              <CardHeader className="">
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent className="">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Date
                    </label>
                    <Select
                      value={selectedDate}
                      onValueChange={setSelectedDate}
                    >
                      <SelectTrigger className="">
                        <SelectValue placeholder="Select date" />
                      </SelectTrigger>
                      <SelectContent className="">
                        {uniqueDates.map((date) => (
                          <SelectItem key={date} value={date} className="">
                            {date}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Employee Name
                    </label>
                    <Select
                      value={selectedEmployee}
                      onValueChange={setSelectedEmployee}
                    >
                      <SelectTrigger className="">
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent className="">
                        {uniqueEmployees.map((employee) => (
                          <SelectItem
                            key={employee}
                            value={employee}
                            className=""
                          >
                            {employee}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Employee Code</label>
                    <Select
                      value={selectedEmployeeCode}
                      onValueChange={setSelectedEmployeeCode}
                    >
                      <SelectTrigger className="">
                        <SelectValue placeholder="Select code" />
                      </SelectTrigger>
                      <SelectContent className="">
                        {uniqueEmployeeCodes.map((code) => (
                          <SelectItem key={code} value={code} className="">
                            {code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 flex flex-col justify-end">
                    <div className="flex gap-2">
                      <Button
                        onClick={applyFilters}
                        className="flex-1 bg-black text-white cursor-pointer"
                        variant="default"
                        size="default"
                      >
                        Apply Filters
                      </Button>
                      <Button
                        variant="outline"
                        onClick={clearFilters}
                        size="default"
                        className="cursor-pointer"
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Time Gap Summary */}
            <Card className="">
              <CardHeader className="">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Time Gap Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="">
                <div className="overflow-x-auto">
                  <button
                    onClick={handleExport}
                    className="mb-4 bg-green-600 text-white p-3 rounded-2xl"
                  >
                    Export to Excel
                  </button>

                  <Table className="">
                    <TableHeader className="">
                      <TableRow className="">
                        <TableHead className="">Employee Name</TableHead>
                        <TableHead className="">Employee Code</TableHead>
                        <TableHead className="">Date</TableHead>
                        <TableHead className="">In Time</TableHead>
                        <TableHead className="">Out Time</TableHead>
                        <TableHead className="">Total Gap</TableHead>
                        <TableHead className="">Records</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="">
                      {timeGapData.map((item, index) => {
                        const date = item.firstTime.split(" ")[0]; // e.g., "13-Jun-2025"
                        const firstTimeOnly = item.firstTime.split(" ")[1]; // e.g., "00:01:08"
                        const lastTimeOnly = item.lastTime.split(" ")[1];
                        return (
                          <TableRow key={index} className="">
                            <TableCell className="font-medium">
                              {item.employeeName}
                            </TableCell>
                            <TableCell className="">
                              {item.employeeCode}
                            </TableCell>
                            <TableCell className="">{date}</TableCell>
                            <TableCell className="">{firstTimeOnly}</TableCell>
                            <TableCell className="">{lastTimeOnly}</TableCell>
                            <TableCell className="text-blue-600 font-semibold">
                              {item.totalGap}
                            </TableCell>
                            <TableCell className="">
                              {item.recordCount}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Data Table */}
            {/* <Card className="">
              <CardHeader className="">
                <CardTitle className="">Employee Log Records ({filteredData.length} records)</CardTitle>
              </CardHeader>
              <CardContent className="">
                <div className="overflow-x-auto">
                  <Table className="">
                    <TableHeader className="">
                      <TableRow className="">
                        <TableHead className="">Log Date</TableHead>
                        <TableHead className="">Direction</TableHead>
                        <TableHead className="">Employee Code</TableHead>
                        <TableHead className="">Employee Name</TableHead>
                        <TableHead className="">Company</TableHead>
                        <TableHead className="">Department</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="">
                      {filteredData.map((record) => (
                        <TableRow key={record.id} className="">
                          <TableCell className="font-mono text-sm">{record.logDate}</TableCell>
                          <TableCell className="">{record.direction}</TableCell>
                          <TableCell className="">{record.employeeCode}</TableCell>
                          <TableCell className="">{record.employeeName}</TableCell>
                          <TableCell className="">{record.company}</TableCell>
                          <TableCell className="">{record.department}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-4 text-center">
                  <div
                    {...getRootProps()}
                    className="inline-block cursor-pointer"
                  >
                    <input {...getInputProps()} />
                    <Button variant="outline" className="flex items-center gap-2" size="default">
                      <Upload className="h-4 w-4" />
                      Upload New File
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card> */}
          </>
        )}
      </div>
    </div>
  );
}
