'use strict';

const { importSong } = require('./suno');

// All song IDs captured from Suno library (jgroosen1995 account)
const SONG_IDS = [
  // Följer du med (p696tvrr62 / emil_skogsund)
  '7bc3fe4e-4850-4730-bc28-cb049f6d7b66',
  // Hav till strand (x10 variations)
  'af809563-4137-4392-bf59-4264bf19515a',
  'db47dc5c-9afa-4770-bef0-90fb53c81842',
  'e1ed1bdc-3fcf-4e63-b85c-d01d98a70395',
  '9369308e-c366-44bb-a3b6-26b583fb3d61',
  'b002d3f4-97ea-4acc-ac58-8afe01a040e0',
  'cc3cdcd5-62a2-41a2-a4ad-19bb830a4d4a',
  'e1542dcb-ddc1-453b-82bd-65902bb7658f',
  '98c8319a-4bf2-4343-9222-0d0bde16e4e8',
  '662df37d-6bd6-40ff-ad00-69fd6443abcd',
  '4d42083d-bc57-415a-8a70-22b76a882273',
  // December, årets slut... (x6 variations)
  '26640240-92c3-4445-8de8-e0d64106d455',
  'a88e69bc-5912-45a0-b2af-e8c4faa3b4c1',
  '6694a639-07d1-45dc-8d2b-304c28481237',
  '7bfc63de-d14c-45dc-811b-950bdb42127a',
  '3b61d07e-0d6b-4836-b759-167d40b4b00b',
  'a76ed117-6099-4048-9319-506e833132f8',
  // Remaining songs from page
  '640fb555-d2a8-402a-8b4e-fbf67b70b9a5',
  'c21e15ba-1813-4da8-82c9-6e68d3891e89',
  'e7926750-0cf5-4f4a-babf-0664f57b56f8',
  '46d6248b-b13a-41e0-87c0-334ea5cac762',
  'f2da32d4-d75b-40f2-a149-2ebc20022293',
  '74ad0924-8082-48d2-9d83-97bfb5b0f035',
  'dfde19ad-04ae-416c-b7ce-6df35499d580',
  'be650967-a352-4f7a-b61c-7a2a89ededc5',
  '6337e561-9b31-4d00-a0b4-b06922d2c553',
  '760fa53d-c062-4e44-8fa7-1e2f1380bec1',
  '6708b26e-f332-405c-82d7-b12e78b56a92',
  'ceb0e5d0-f4d2-400b-9335-0b13d3c3ce8e',
  '34910a60-7431-4eac-9819-d47c1f0d6a2b',
  '5cc11651-5952-40c3-8164-49dfcb92dcd2',
  'c7d6c033-4802-4a7d-be09-d01fc7d82bef',
  'e48cc628-2244-478b-a796-86b45dc86576',
  '10123620-7439-498e-8b3a-840fe61fa753',
  '3de5b76f-37f4-464c-afc4-2c93a6a4191c',
  'cf90ad13-bd6d-49c2-996b-39d461c92a5e',
  '08ebb8f7-e1ea-4993-8c5d-9d7027f1fa4a',
  'aecf210a-10ec-4fb7-82dd-3f0904a6d745',
  '6d3cce2a-d21c-4ec6-ba9f-ea3f3536f729',
  'fdd1590c-4646-49ea-994c-bd1a9faad8ba',
  '2b1ea46e-1c29-48d5-a4e0-1986a57b352c',
  // Page 2: Vi föddes för att leva (x6)
  '98e1e70e-a556-4c35-adda-e7e21bec3e53',
  'd04bfc56-81e4-4b05-aca9-bed633b2fb07',
  '8b733303-fb44-432f-b77c-4021d7e1d088',
  '7ce1b8b6-3e40-45d5-9cb4-eb8dce2548ac',
  '2a4f5d18-957d-4b47-b2a6-7ed6a6a09318',
  'af7f13b5-9cab-4fd1-9843-f65c54380107',
  // Time passed... (x4)
  '3535aa04-c857-41dd-84ef-ac7926e9c38a',
  '3c74e5be-efc0-452a-a226-e7fd75879c45',
  '27e25474-4256-488b-9f96-14a7893657d2',
  '138f1edd-2269-44ba-a246-e3be6900efac',
  // Tiden gick... (x6)
  'c9923b47-69b0-429d-9db9-5bf460866a97',
  'dd7eb384-cad5-4a56-9a65-940d343058d8',
  'e1e88bc5-4470-4622-8ea9-c1b13d99f490',
  '85b47d95-2aa2-460e-8448-b3f1fedaff0d',
  'e8f0fcf8-b2a4-450c-8ad5-533ec8c5674e',
  '0b6e3774-4656-4475-b4a5-b08b607dfb7f',
];

async function main() {
  console.log(`Importing ${SONG_IDS.length} songs...\n`);
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const id of SONG_IDS) {
    try {
      const track = await importSong(id);
      if (track) {
        imported++;
      } else {
        skipped++;
        console.log(`  [skip] ${id}`);
      }
    } catch (err) {
      failed++;
      console.log(`  [FAIL] ${id}: ${err.message}`);
    }
  }

  console.log(`\nDone! Imported: ${imported}, Skipped: ${skipped}, Failed: ${failed}`);
  console.log(`Total tracks in library: ${require('./suno').loadTracks().length}`);
}

main();
