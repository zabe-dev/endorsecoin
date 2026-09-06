'use client';

import { DateInput } from '@/features/submissions/components/submission-fields';
import { Icon as IconifyIcon } from '@iconify/react';
import { Globe2, Send } from 'lucide-react';
import { useState } from 'react';

const approvedProjects = ['EndorseCoin', 'Nebula Pepe', 'OrbitFi', 'MoonForge'];

const socialLinks = [
  { label: 'Telegram', icon: 'akar-icons:telegram-fill', placeholder: 'https://t.me/project' },
  { label: 'X / Twitter', icon: 'akar-icons:x-fill', placeholder: 'https://x.com/project' },
  { label: 'Reddit', icon: 'akar-icons:reddit-fill', placeholder: 'https://reddit.com/r/project' },
  { label: 'Discord', icon: 'akar-icons:discord-fill', placeholder: 'https://discord.gg/project' },
  {
    label: 'YouTube',
    icon: 'akar-icons:youtube-fill',
    placeholder: 'https://youtube.com/@project',
  },
  {
    label: 'Facebook',
    icon: 'akar-icons:facebook-fill',
    placeholder: 'https://facebook.com/project',
  },
];

export function AirdropSubmissionPrototype({ today }: { today: string }) {
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  return (
    <form className="airdrop-form">
      <label>
        Name
        <input placeholder="Early Signal Rewards" />
      </label>

      <label>
        Claim Rewards URL
        <input placeholder="https://example.com/claim" type="url" />
      </label>

      <label className="airdrop-form-wide">
        Project
        <select defaultValue="">
          <option value="" disabled>
            Select an approved project
          </option>
          {approvedProjects.map((project) => (
            <option key={project}>{project}</option>
          ))}
        </select>
        <small>Must be an approved project listed on EndorseCoin.</small>
      </label>

      <label className="airdrop-form-wide">
        Description
        <textarea placeholder="Explain who can join, what users need to do, and any important conditions." />
      </label>

      <label>
        Rewards
        <input placeholder="$2,500 token pool" />
      </label>

      <label>
        Number of winners
        <input min="1" placeholder="250" type="number" />
      </label>

      <div className="airdrop-date-row">
        <label>
          Start Date
          <DateInput value={startDate} onChange={setStartDate} />
        </label>
        <label>
          Start Time
          <input type="time" defaultValue="00:00" />
        </label>
      </div>

      <div className="airdrop-date-row">
        <label>
          End Date
          <DateInput value={endDate} onChange={setEndDate} />
        </label>
        <label>
          End Time
          <input type="time" defaultValue="00:00" />
        </label>
      </div>

      <label className="airdrop-form-wide airdrop-icon-input">
        Website
        <span>
          <Globe2 aria-hidden="true" />
          <input placeholder="https://project.com" type="url" />
        </span>
      </label>

      <div className="airdrop-social-grid airdrop-form-wide">
        <span>Social Media Links</span>
        {socialLinks.map((link) => (
          <label className="airdrop-icon-input" key={link.label}>
            {link.label}
            <span>
              <IconifyIcon icon={link.icon} aria-hidden="true" />
              <input placeholder={link.placeholder} />
            </span>
          </label>
        ))}
      </div>

      <button className="airdrop-submit-preview" type="button">
        <Send aria-hidden="true" />
        Prototype only — no submission yet
      </button>
    </form>
  );
}
