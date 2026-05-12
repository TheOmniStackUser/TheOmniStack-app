
const { S3Client, CreateBucketCommand } = require('@aws-sdk/client-s3');

async function run() {
  const client = new S3Client({
    region: 'us-east-1',
    endpoint: 'http://localhost:9000',
    forcePathStyle: true,
    credentials: {
      accessKeyId: 'admin',
      secretAccessKey: 'password123',
    },
  });

  try {
    console.log('Attempting to create bucket "omnistack-documents"...');
    await client.send(new CreateBucketCommand({ Bucket: 'omnistack-documents' }));
    console.log('Success!');
  } catch (err) {
    console.error('Error:', err.message);
    if (err.name === 'BucketAlreadyOwnedByYou' || err.name === 'BucketAlreadyExists') {
      console.log('Bucket already exists.');
    }
  }
}

run();
