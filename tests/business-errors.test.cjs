const {test}=require('node:test');const assert=require('node:assert/strict');require('tsx/cjs');
const {businessErrorMessage}=require('../apps/admin-portal/lib/business-error.ts');
test('business form distinguishes duplicate credentials, invalid fields and timeouts',()=>{
 assert.match(businessErrorMessage({code:'USER_EMAIL_EXISTS'},false),/email përdoret/);
 assert.match(businessErrorMessage({code:'USER_PHONE_EXISTS'},false),/telefoni përdoret/);
 assert.match(businessErrorMessage({code:'VALIDATION_ERROR',issues:[{path:['phone']},{path:['password']}]},false),/Telefoni.*Fjalëkalimi/);
 assert.match(businessErrorMessage({code:'ADMIN_API_TIMEOUT'},false),/nëse biznesi u ruajt/);
 assert.match(businessErrorMessage({code:'GOOGLE_MAPS_LOCATION_NOT_RESOLVED'},false),/Google Maps/);
});
