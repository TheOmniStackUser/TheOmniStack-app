const fs = require('fs');

const file = 'src/app/api/auth/callback/otto/route.ts';
let content = fs.readFileSync(file, 'utf8');

// The production array is currently:
// : ['ee1fc586-b339-47fb-80a7-22e239d575cd', 'fb5f4e1a-5a8f-4eb3-89b1-237f359d4709', '6a0c0a71102c6f4203615ea3', '69eb5ed304bb0234c14c27b5']

content = content.replace(
  /:\s*\['ee1fc586-b339-47fb-80a7-22e239d575cd',/g, 
  ": [process.env.OTTO_APP_ID || '40c96391-5c99-4823-ace9-95e22df735bc', 'ee1fc586-b339-47fb-80a7-22e239d575cd',"
);

fs.writeFileSync(file, content);
console.log('Fixed App ID in callback route');
