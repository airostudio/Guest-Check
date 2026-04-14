import { PrismaClient, UserRole, PropertyType, PropertyStatus, SubscriptionTier } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create super admin
  const adminPassword = await bcrypt.hash('Admin@GuestCheck123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@guestcheck.io' },
    update: {},
    create: {
      email: 'admin@guestcheck.io',
      password: adminPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: UserRole.SUPER_ADMIN,
      emailVerified: true,
    },
  });

  console.log('Created admin user:', admin.email);

  // Create a demo property
  const property = await prisma.property.upsert({
    where: { id: 'demo-property-001' },
    update: {},
    create: {
      id: 'demo-property-001',
      name: 'The Grand Demo Hotel',
      type: PropertyType.HOTEL,
      address: '123 Main Street',
      city: 'London',
      country: 'GB',
      postcode: 'W1A 1AA',
      phone: '+44 20 1234 5678',
      website: 'https://granddemohotel.com',
      status: PropertyStatus.ACTIVE,
      subscriptionTier: SubscriptionTier.PROFESSIONAL,
      billingEmail: 'billing@granddemohotel.com',
    },
  });

  console.log('Created demo property:', property.name);

  // Create demo property manager
  const managerPassword = await bcrypt.hash('Manager@Demo123!', 12);
  await prisma.user.upsert({
    where: { email: 'manager@granddemohotel.com' },
    update: {},
    create: {
      email: 'manager@granddemohotel.com',
      password: managerPassword,
      firstName: 'Jane',
      lastName: 'Smith',
      role: UserRole.PROPERTY_ADMIN,
      emailVerified: true,
      propertyId: property.id,
    },
  });

  // Create a demo receptionist
  const receptionistPassword = await bcrypt.hash('Reception@Demo123!', 12);
  await prisma.user.upsert({
    where: { email: 'reception@granddemohotel.com' },
    update: {},
    create: {
      email: 'reception@granddemohotel.com',
      password: receptionistPassword,
      firstName: 'Tom',
      lastName: 'Jones',
      role: UserRole.RECEPTIONIST,
      emailVerified: true,
      propertyId: property.id,
    },
  });

  console.log('Created demo staff accounts');
  console.log('\nSeed completed successfully!');
  console.log('\nDemo credentials:');
  console.log('  Admin:       admin@guestcheck.io / Admin@GuestCheck123!');
  console.log('  Manager:     manager@granddemohotel.com / Manager@Demo123!');
  console.log('  Receptionist: reception@granddemohotel.com / Reception@Demo123!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
