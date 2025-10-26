import ProfileForm from '@/components/ProfileForm';

export default function ProfilePage(){
  return (
    <main className="grid gap-4">
      <h1 className="text-xl font-semibold">Profile</h1>
      <ProfileForm />
    </main>
  );
}
