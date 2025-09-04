#!/usr/bin/env node

const fetch = require('node-fetch');

// Configuration
const BASE_URL = 'http://localhost:3000';
const LIST_ID_1 = process.argv[2]; // Original list ID
const LIST_ID_2 = process.argv[3]; // New list ID

if (!LIST_ID_1 || !LIST_ID_2) {
  console.log('Usage: node test-list-comparison.js <original_list_id> <new_list_id>');
  console.log('Example: node test-list-comparison.js 12345 67890');
  process.exit(1);
}

async function testListComparison() {
  try {
    console.log(`🔍 Comparing lists...`);
    console.log(`📋 Original List ID: ${LIST_ID_1}`);
    console.log(`📋 New List ID: ${LIST_ID_2}`);
    console.log('');

    const response = await fetch(
      `${BASE_URL}/api/compare-lists?listId1=${LIST_ID_1}&listId2=${LIST_ID_2}`
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`API Error: ${response.status} - ${error.error}`);
    }

    const data = await response.json();
    
    console.log('📊 COMPARISON RESULTS:');
    console.log('=====================');
    console.log(`List 1 (Original): ${data.list1.count} entries`);
    console.log(`List 2 (New): ${data.list2.count} entries`);
    console.log('');
    
    console.log('🔍 ANALYSIS:');
    console.log(`✅ Same opportunities: ${data.analysis.same_opportunities}`);
    console.log(`❌ Different opportunities: ${data.analysis.different_opportunities}`);
    console.log(`📈 Total compared: ${data.analysis.total_compared}`);
    console.log('');

    if (data.analysis.same_opportunities > 0) {
      console.log('🎯 SAME OPPORTUNITIES (Entity IDs match):');
      console.log('These are the SAME opportunities across both lists:');
      data.comparison.sameOpportunities.slice(0, 5).forEach((opp, index) => {
        console.log(`  ${index + 1}. Entity ID: ${opp.entity_id}`);
        console.log(`     List 1 Entry ID: ${opp.list1_entry_id}`);
        console.log(`     List 2 Entry ID: ${opp.list2_entry_id}`);
        console.log(`     List 1 Created: ${opp.list1_created_at}`);
        console.log(`     List 2 Created: ${opp.list2_created_at}`);
        console.log('');
      });
      
      if (data.comparison.sameOpportunities.length > 5) {
        console.log(`  ... and ${data.comparison.sameOpportunities.length - 5} more`);
        console.log('');
      }
    }

    if (data.analysis.different_opportunities > 0) {
      console.log('🆕 DIFFERENT OPPORTUNITIES (New Entity IDs):');
      console.log('These are NEW opportunities created in the new list:');
      data.comparison.differentOpportunities.slice(0, 5).forEach((opp, index) => {
        console.log(`  ${index + 1}. Entity ID: ${opp.entity_id}`);
        console.log(`     List 2 Entry ID: ${opp.list2_entry_id}`);
        console.log(`     List 2 Created: ${opp.list2_created_at}`);
        console.log('');
      });
      
      if (data.comparison.differentOpportunities.length > 5) {
        console.log(`  ... and ${data.comparison.differentOpportunities.length - 5} more`);
        console.log('');
      }
    }

    console.log('📝 SAMPLE ENTRIES FROM LIST 1 (Original):');
    data.list1.sample_entries.forEach((entry, index) => {
      console.log(`  ${index + 1}. Entry ID: ${entry.id}`);
      console.log(`     Entity ID: ${entry.entity_id}`);
      console.log(`     Entity Type: ${entry.entity_type}`);
      console.log(`     Created: ${entry.created_at}`);
      console.log('');
    });

    console.log('📝 SAMPLE ENTRIES FROM LIST 2 (New):');
    data.list2.sample_entries.forEach((entry, index) => {
      console.log(`  ${index + 1}. Entry ID: ${entry.id}`);
      console.log(`     Entity ID: ${entry.entity_id}`);
      console.log(`     Entity Type: ${entry.entity_type}`);
      console.log(`     Created: ${entry.created_at}`);
      console.log('');
    });

    // Summary conclusion
    console.log('🎯 CONCLUSION:');
    if (data.analysis.same_opportunities > 0 && data.analysis.different_opportunities === 0) {
      console.log('✅ SUCCESS: All opportunities are the same across both lists!');
      console.log('   This means the CSV import preserved the original opportunities.');
    } else if (data.analysis.same_opportunities > 0 && data.analysis.different_opportunities > 0) {
      console.log('⚠️  MIXED: Some opportunities are the same, some are different.');
      console.log('   This suggests partial preservation during CSV import.');
    } else if (data.analysis.different_opportunities > 0 && data.analysis.same_opportunities === 0) {
      console.log('❌ DIFFERENT: All opportunities are different across both lists!');
      console.log('   This means the CSV import created NEW opportunities instead of preserving the originals.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Check if dev server is running
async function checkServer() {
  try {
    const response = await fetch(`${BASE_URL}/api/lists`);
    if (response.ok) {
      return true;
    }
  } catch (error) {
    return false;
  }
  return false;
}

async function main() {
  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.log('❌ Error: Development server is not running.');
    console.log('Please start the server with: npm run dev');
    process.exit(1);
  }

  await testListComparison();
}

main();
