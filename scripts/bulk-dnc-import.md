# 📞 Bulk DNC Import Guide

## Overview

This guide provides step-by-step instructions for bulk importing 1.5 million DNC (Do Not Call) records into your CRM system. The process is designed to handle large datasets efficiently with proper error handling and progress tracking.

## 🚀 Quick Start

### 1. Deploy Cloud Functions

First, deploy the new bulk import functions to Firebase:

```bash
# Navigate to functions directory
cd functions

# Install dependencies (if not already done)
npm install

# Deploy the functions
firebase deploy --only functions

# Verify deployment
firebase functions:list
```

### 2. Prepare Your Data

#### Supported File Formats
- **CSV**: Comma-separated values
- **Excel**: .xlsx or .xls files

#### Required Columns
Your file must contain at least one of these columns for phone numbers:
- `phone` or `number` or `phone_number` or `contact`

Optional columns:
- `reason` or `notes` or `comment`

#### Sample CSV Format
```csv
number,reason
+971501234567,Customer requested removal
+971509876543,Invalid number
+971501112233,Business closed
```

#### Sample Excel Format
| number | reason |
|--------|--------|
| +971501234567 | Customer requested removal |
| +971509876543 | Invalid number |
| +971501112233 | Business closed |

### 3. Data Validation

Before importing, ensure your data meets these requirements:

#### Phone Number Format
- Must be valid UAE phone numbers
- Supported formats:
  - `+971501234567` (UFN)
  - `971501234567` (with country code)
  - `0501234567` (local format)

#### File Size Limits
- Maximum file size: 50MB
- Recommended chunk size: 10,000 records per file for large imports

#### Data Cleaning
The system automatically:
- Removes non-digit characters (except +)
- Converts local numbers to international format
- Validates number format
- Removes duplicates

## 📋 Import Process

### Method 1: Using the Admin Interface

1. **Access the Admin Dashboard**
   - Log in as an admin user
   - Navigate to Admin → DNC Management
   - Click "Bulk Import" button

2. **Upload Your File**
   - Drag and drop your CSV/Excel file
   - Or click "Choose File" to browse
   - Wait for file parsing to complete

3. **Review Validation Results**
   - Check for any validation errors
   - Review the record summary
   - Fix any issues in your source file if needed

4. **Start Import**
   - Click "Import X Records" button
   - Monitor progress in real-time
   - Wait for completion

### Method 2: Direct API Calls (For Large Datasets)

For 1.5 million records, you'll need to split your data and use multiple API calls:

#### Step 1: Split Your Data
```bash
# Split large CSV file into chunks of 10,000 records each
split -l 10000 your-dnc-file.csv chunk_
```

#### Step 2: Upload Each Chunk
```javascript
// Example Node.js script for bulk upload
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');

async function uploadDNCChunk(filePath) {
  const records = [];
  
  // Read and parse CSV file
  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => {
      records.push({
        number: row.number || row.phone,
        reason: row.reason || row.notes,
        source: 'bulk_import'
      });
    })
    .on('end', async () => {
      try {
        const response = await axios.post(
          'https://us-central1-your-project-id.cloudfunctions.net/bulkDNCImport',
          {
            records: records,
            batchSize: 500,
            source: 'bulk_import',
            addedBy: 'admin'
          },
          {
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log(`Uploaded ${records.length} records:`, response.data);
      } catch (error) {
        console.error('Upload failed:', error.response?.data || error.message);
      }
    });
}

// Upload all chunks
const chunkFiles = ['chunk_aa', 'chunk_ab', 'chunk_ac']; // Add all your chunk files
chunkFiles.forEach(uploadDNCChunk);
```

### Method 3: Using Firebase CLI (Advanced)

For very large datasets, you can use Firebase CLI with custom scripts:

```bash
# Create a custom import script
cat > import-dnc.js << 'EOF'
const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-parser');

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

async function importDNCRecords(filePath) {
  const records = [];
  
  // Read CSV file
  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => {
      records.push({
        number: row.number || row.phone,
        reason: row.reason || row.notes,
        source: 'bulk_import',
        addedBy: 'admin',
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active'
      });
    })
    .on('end', async () => {
      console.log(`Processing ${records.length} records...`);
      
      // Process in batches of 500 (Firestore limit)
      const batchSize = 500;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = db.batch();
        const chunk = records.slice(i, i + batchSize);
        
        chunk.forEach(record => {
          const docRef = db.collection('dncNumbers').doc();
          batch.set(docRef, record);
        });
        
        await batch.commit();
        console.log(`Processed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(records.length/batchSize)}`);
      }
      
      console.log('Import completed!');
    });
}

// Run the import
importDNCRecords('your-dnc-file.csv');
EOF

# Run the import script
node import-dnc.js
```

## 📊 Monitoring and Verification

### Check Import Status

```bash
# Check total DNC records
curl -X GET "https://us-central1-your-project-id.cloudfunctions.net/bulkDNCImportStatus"

# Response example:
{
  "totalDNCRecords": 1500000,
  "recentImports24h": 1500000,
  "timestamp": "2024-12-20T10:30:00.000Z"
}
```

### Verify Data Quality

```javascript
// Check for duplicates
const duplicates = await db.collection('dncNumbers')
  .where('number', '==', '+971501234567')
  .get();

console.log(`Found ${duplicates.size} duplicates for number`);

// Check data distribution
const stats = await db.collection('dncNumbers')
  .where('source', '==', 'bulk_import')
  .get();

console.log(`Total bulk imported records: ${stats.size}`);
```

## 🔧 Troubleshooting

### Common Issues

#### 1. File Too Large
**Error**: "File size must be less than 50MB"
**Solution**: Split your file into smaller chunks

#### 2. Invalid Phone Numbers
**Error**: "Invalid phone number format"
**Solution**: Ensure numbers are in UAE format (+971XXXXXXXXX)

#### 3. Memory Issues
**Error**: "Function timeout" or "Out of memory"
**Solution**: Reduce batch size or split data further

#### 4. Authentication Errors
**Error**: "Admin access required"
**Solution**: Ensure you're logged in as an admin user

### Performance Optimization

#### For Large Datasets (1M+ records)

1. **Use Chunked Uploads**
   ```bash
   # Split your file into 10,000 record chunks
   split -l 10000 large-dnc-file.csv chunk_
   ```

2. **Process in Parallel**
   ```javascript
   // Upload multiple chunks simultaneously
   const uploadPromises = chunkFiles.map(uploadDNCChunk);
   await Promise.all(uploadPromises);
   ```

3. **Monitor Progress**
   ```javascript
   // Track upload progress
   let completedChunks = 0;
   const totalChunks = chunkFiles.length;
   
   chunkFiles.forEach(async (file) => {
     await uploadDNCChunk(file);
     completedChunks++;
     console.log(`Progress: ${completedChunks}/${totalChunks}`);
   });
   ```

## 📈 Expected Performance

### Import Speeds
- **Small files (< 10K records)**: 1-2 minutes
- **Medium files (10K-100K records)**: 10-20 minutes
- **Large files (100K-1M records)**: 1-2 hours
- **Very large files (1M+ records)**: 2-4 hours

### Resource Usage
- **Memory**: 2GB per function instance
- **Timeout**: 9 minutes per function call
- **Batch size**: 500 records per batch (Firestore limit)

## 🛡️ Security Considerations

### Data Privacy
- All imported data is stored securely in Firebase Firestore
- Access is restricted to authenticated admin users
- Data is encrypted at rest and in transit

### Audit Trail
- All imports are logged with timestamps
- Source tracking for imported records
- User attribution for import actions

## 📞 Support

If you encounter issues during the bulk import process:

1. **Check the logs**: Firebase Console → Functions → Logs
2. **Verify file format**: Ensure CSV/Excel format is correct
3. **Test with sample data**: Use small files first to test the process
4. **Contact support**: Reach out to the development team

## 🎯 Best Practices

### Before Import
- [ ] Test with a small sample file first
- [ ] Validate phone number formats
- [ ] Clean and deduplicate your data
- [ ] Backup existing DNC data

### During Import
- [ ] Monitor progress and logs
- [ ] Don't interrupt the process
- [ ] Keep browser/terminal open
- [ ] Check for errors regularly

### After Import
- [ ] Verify record counts
- [ ] Test DNC checking functionality
- [ ] Update documentation
- [ ] Notify relevant teams

---

**Note**: This is a one-time process for importing 1.5 million DNC records. The system is designed to handle this scale efficiently with proper error handling and progress tracking.
