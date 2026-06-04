const XLSX = require('xlsx');
const path = require('path');

// Columns for the student import template (matches export format)
const headers = [
  'S.No', 'Name', 'Roll', 'Class', 'Batch', 'Gender', 'DOB', 
  'Blood', 'Category', 'Father', 'Mother', 'Mobile', 'Email', 
  'Address', 'City', 'Adm.No', 'Adm.Date', 'Year', 'Board', 
  'House', 'Transport', 'Status'
];

// Format examples row
const formatExamples = [
  '',
  '(Required)',
  '(e.g., 101)',
  '(e.g., 1-12)',
  '(1 or 2)',
  '(Male/Female/Other)',
  '(dd/mm/yyyy)',
  '(A+, A-, B+, B-, O+, O-, AB+, AB-)',
  '(General/OBC/SC/ST/EWS)',
  '',
  '',
  '(Required, e.g., +91 XXXXX XXXXX)',
  '(e.g., parent@email.com)',
  '',
  '',
  '',
  '',
  '(e.g., 2025-26)',
  '(e.g., CBSE)',
  '(e.g., Blue/Red/Green)',
  '',
  '(active/inactive/alumni)'
];

// Sample student data (2 examples)
const sampleData = [
  [
    '1', 'Aarav Sharma', '101', '10', '1', 'Male', 
    '15/05/2010', 'O+', 'General', 'Rajesh Sharma', 
    'Priya Sharma', '+91 98765 43210', 'aarav.parent@gmail.com', 
    '123 Main Street, Sector 5', 'Mumbai', 'ADM-2023-001', '01/06/2023', 
    '2023-2024', 'CBSE', 'Red', 'Bus Route 1', 'active'
  ],
  [
    '2', 'Diya Patel', '102', '9', '2', 'Female', 
    '22/08/2011', 'A+', 'OBC', 'Ramesh Patel', 
    'Meera Patel', '+91 98765 43211', 'diya.parent@gmail.com', 
    '456 Park Avenue, Near Park', 'Delhi', 'ADM-2023-002', '02/06/2023', 
    '2023-2024', 'CBSE', 'Blue', 'Van Route 2', 'active'
  ]
];

// Create workbook and sheet with same header format as export
const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.aoa_to_sheet([
  ['Student Database'],
  ['Generated: ' + new Date().toLocaleDateString(), '', 'Total: 2'],
  [''],
  headers,
  formatExamples,
  ...sampleData
]);

// Style column widths (optional, makes it easier to read)
worksheet['!cols'] = [
  { wch: 6 },  // S.No
  { wch: 18 }, // Name
  { wch: 10 }, // Roll
  { wch: 8 },  // Class
  { wch: 8 },  // Batch
  { wch: 10 }, // Gender
  { wch: 12 }, // DOB
  { wch: 10 }, // Blood
  { wch: 10 }, // Category
  { wch: 18 }, // Father
  { wch: 18 }, // Mother
  { wch: 18 }, // Mobile
  { wch: 24 }, // Email
  { wch: 30 }, // Address
  { wch: 12 }, // City
  { wch: 14 }, // Adm.No
  { wch: 12 }, // Adm.Date
  { wch: 12 }, // Year
  { wch: 10 }, // Board
  { wch: 12 }, // House
  { wch: 14 }, // Transport
  { wch: 10 }  // Status
];

// Add worksheet to workbook
XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');

// Write to file
const outputPath = path.join(__dirname, 'Student_Import_Template.xlsx');
XLSX.writeFile(workbook, outputPath);

console.log(`✅ Student import template generated successfully!`);
console.log(`📄 File location: ${outputPath}`);
console.log(`
📋 Columns & Formats:
${headers.map((h, i) => `${i+1}. ${h}: ${formatExamples[i] || '-'}`).join('\n')}

💡 Instructions:
1. Open the generated Excel file
2. Rows 1-4 are headers and format examples - keep them!
3. Replace the sample data (rows 6-7) with your actual student data
4. Use the "Import Students" button in the app to import!
`);
