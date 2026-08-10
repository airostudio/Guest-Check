import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const qc = useQueryClient();

  const { data: property } = useQuery({
    queryKey: ['my-property'],
    queryFn: () => api.get('/properties/mine').then((r) => r.data.data),
  });

  const [propertyForm, setPropertyForm] = useState({
    name: '', phone: '', website: '', description: '', billingEmail: '',
  });

  // `property` is undefined on first render (react-query hasn't resolved), so
  // seeding state inline left every field as ''. The inputs displayed the real
  // value via a `|| property?.x` fallback while state held '', and the PATCH
  // handler treats '' as an intentional clear — so editing only the name
  // silently wiped phone, website and description. Sync once data arrives.
  const [propertyLoaded, setPropertyLoaded] = useState(false);
  useEffect(() => {
    if (!property || propertyLoaded) return;
    setPropertyForm({
      name: property.name ?? '',
      phone: property.phone ?? '',
      website: property.website ?? '',
      description: property.description ?? '',
      billingEmail: property.billingEmail ?? '',
    });
    setPropertyLoaded(true);
  }, [property, propertyLoaded]);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [newMember, setNewMember] = useState({ email: '', firstName: '', lastName: '', role: 'PROPERTY_MANAGER' });
  const [showAddMember, setShowAddMember] = useState(false);

  const updateProperty = useMutation({
    mutationFn: (data: typeof propertyForm) => api.patch('/properties/mine', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-property'] }); toast.success('Property updated'); refreshUser(); },
    onError: () => toast.error('Failed to update property'),
  });

  const changePassword = useMutation({
    mutationFn: () => api.post('/auth/change-password', {
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    }),
    onSuccess: () => {
      toast.success('Password changed');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to change password';
      toast.error(msg);
    },
  });

  const addMember = useMutation({
    mutationFn: () => api.post('/properties/mine/team', newMember),
    onSuccess: ({ data }) => {
      qc.invalidateQueries({ queryKey: ['my-property'] });
      setShowAddMember(false);
      setNewMember({ email: '', firstName: '', lastName: '', role: 'PROPERTY_MANAGER' });
      toast.success(`Team member added. Temp password: ${data.data.temporaryPassword}`, { duration: 10000 });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to add team member';
      toast.error(msg);
    },
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.delete(`/properties/mine/team/${userId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-property'] }); toast.success('Team member removed'); },
  });

  const canManageTeam = user?.role === 'SUPER_ADMIN' || user?.role === 'PROPERTY_ADMIN';

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">Manage your property and account settings.</p>
      </div>

      {/* Property settings */}
      {canManageTeam && (
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-slate-900">Property Information</h2>
          <div>
            <label className="label">Property name</label>
            <input type="text" className="input" value={propertyForm.name} onChange={(e) => setPropertyForm({ ...propertyForm, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Phone</label>
              <input type="tel" className="input" value={propertyForm.phone} onChange={(e) => setPropertyForm({ ...propertyForm, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">Website</label>
              <input type="url" className="input" value={propertyForm.website} onChange={(e) => setPropertyForm({ ...propertyForm, website: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input resize-none" rows={3} value={propertyForm.description} onChange={(e) => setPropertyForm({ ...propertyForm, description: e.target.value })} />
          </div>
          <div>
            <label className="label">Billing email</label>
            <input type="email" className="input" value={propertyForm.billingEmail} onChange={(e) => setPropertyForm({ ...propertyForm, billingEmail: e.target.value })} />
          </div>
          <button onClick={() => updateProperty.mutate(propertyForm)} disabled={updateProperty.isPending} className="btn-primary">
            {updateProperty.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Team members */}
      {canManageTeam && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Team Members</h2>
            <button onClick={() => setShowAddMember(!showAddMember)} className="btn-primary text-sm">+ Add Member</button>
          </div>

          {showAddMember && (
            <div className="p-4 bg-slate-50 rounded-xl mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">First name</label><input type="text" className="input" value={newMember.firstName} onChange={(e) => setNewMember({ ...newMember, firstName: e.target.value })} /></div>
                <div><label className="label">Last name</label><input type="text" className="input" value={newMember.lastName} onChange={(e) => setNewMember({ ...newMember, lastName: e.target.value })} /></div>
              </div>
              <div><label className="label">Email</label><input type="email" className="input" value={newMember.email} onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} /></div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={newMember.role} onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}>
                  <option value="PROPERTY_MANAGER">Property Manager</option>
                  <option value="RECEPTIONIST">Receptionist</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowAddMember(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={() => addMember.mutate()} disabled={addMember.isPending} className="btn-primary flex-1">
                  {addMember.isPending ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {property?.users?.map((member: { id: string; firstName: string; lastName: string; email: string; role: string; isActive: boolean }) => (
              <div key={member.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-sm text-slate-900">{member.firstName} {member.lastName}</p>
                  <p className="text-xs text-slate-500">{member.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge bg-slate-100 text-slate-600 text-xs">{member.role.replace('_', ' ')}</span>
                  {member.id !== user?.id && (
                    <button onClick={() => removeMember.mutate(member.id)} className="btn-danger text-xs py-1 px-2">Remove</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Change password */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-slate-900">Change Password</h2>
        <div>
          <label className="label">Current password</label>
          <input type="password" className="input" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} />
        </div>
        <div>
          <label className="label">New password</label>
          <input type="password" className="input" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input type="password" className="input" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} />
        </div>
        <button
          onClick={() => {
            if (passwordForm.newPassword !== passwordForm.confirmPassword) { toast.error('Passwords do not match'); return; }
            changePassword.mutate();
          }}
          disabled={changePassword.isPending}
          className="btn-primary"
        >
          {changePassword.isPending ? 'Changing...' : 'Change Password'}
        </button>
      </div>
    </div>
  );
}
