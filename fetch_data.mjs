import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://watndeleriyxritpjpsx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhdG5kZWxlcml5eHJpdHBqcHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4ODUxMDIsImV4cCI6MjA5MTQ2MTEwMn0.iAWEnavoqJ7QQKk_2wLUbaX8dW-PNimkrGnMBbEtoTo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchData() {
  const { data, error } = await supabase
    .from('operations')
    .select('*, vehicles(*)');
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Success! Fetched ${data.length} operations.`);
    import('fs').then(fs => fs.writeFileSync('dump.json', JSON.stringify(data, null, 2)));
  }
}

fetchData();
