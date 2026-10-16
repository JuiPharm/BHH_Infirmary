import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';

// Publish only code. Never package Google Sheet data, Apps Script credentials or patient records.
const root=resolve(import.meta.dirname,'..');
const sourceFiles=['Code.gs','30_Recipients.gs','35_AllergyRules.gs','36_AllergySafetyDryRun.gs','40_ClinicalP4.gs','60_Notification.gs','70_DashboardP4.gs'];
const output=join(root,'dist','gas-sandbox-uat');
mkdirSync(output,{recursive:true});
const manifest={application:'BHH Infirmary',target:'SYNTHETIC_GAS_SANDBOX_ONLY',files:[],createdBy:'scripts/package-gas-uat.mjs'};
for(const name of sourceFiles){
 const source=join(root,'backend',name);
 const data=readFileSync(source);
 if(!data.length)throw Error('Empty GAS source: '+name);
 copyFileSync(source,join(output,name));
 manifest.files.push({file:name,sha256:createHash('sha256').update(data).digest('hex')});
}
writeFileSync(join(output,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
writeFileSync(join(output,'INSTALL_SANDBOX_ONLY.txt'),[
 'BHH Infirmary - GAS SANDBOX UAT package. DO NOT COPY INTO PRODUCTION GAS.',
 '',
 '1. Open the dedicated GAS SANDBOX project (not the Production project).',
 '2. Verify its Script Property SHEET_ID points to the synthetic UAT working copy.',
 '3. Back up existing SANDBOX GAS source. Do not change or publish Production.',
 '4. Replace each matching .gs source file with the corresponding package file;',
 '   add the NEW file 36_AllergySafetyDryRun.gs (do not paste it twice).',
 '5. Script Editor: Save all. Run syntax/authorized smoke check using a dedicated UAT account.',
 '6. The DRUG_ALLERGY_RULES tab is already created in the synthetic working copy;',
 '   do NOT rerun setupSystem() or seedUser() for this upgrade.',
 '7. Deploy > Manage deployments > create NEW Sandbox deployment version (or edit sandbox deployment).',
 '8. Keep referral/emergency email DISABLED, use synthetic patients and medicines only.',
 '9. Confirm GET health API version, login, then read-only runSyntheticAllergySafetyCheck;',
 '   the hard stop dry-run writes NO Visit/Stock and accepts NO caller-provided drugs;',
 '',
 'Never combine a generated unified GAS Code.gs with existing separate .gs files;',
 'this package contains only the seven intended distinct Apps Script source files.',
 'Any client-facing Cloudflare admin UI should remain blocked until GAS Sandbox integration UAT passes.'
].join('\n')+'\n');
console.log('Created synthetic-only Apps Script source package with',manifest.files.length,'files.');
