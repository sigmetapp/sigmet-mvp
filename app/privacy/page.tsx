'use client';

import { useTheme } from '@/components/ThemeProvider';

export default function PrivacyPage() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      <div className="mb-8">
        <h1 className={`text-3xl md:text-4xl font-semibold tracking-tight mb-4 ${
          isLight 
            ? "bg-gradient-to-r from-primary-blue to-primary-blue-light bg-clip-text text-transparent" 
            : "gradient-text"
        }`}>
          Privacy Policy
        </h1>
        <p className={`${isLight ? "text-black/60" : "text-white/60"} text-lg`}>
          Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className={`space-y-8 ${isLight ? 'bg-white' : 'bg-white/5'} rounded-xl border ${
        isLight ? 'border-black/10' : 'border-white/10'
      } p-6 md:p-8`}>
        <section>
          <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            1. Information We Collect
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>
              We collect information that you provide directly to us, including:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Account information (email address, name, profile information)</li>
              <li>Content you create, post, or share on our platform</li>
              <li>Communications with other users through our messaging features</li>
              <li>Information about your use of our services</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            2. How We Use Your Information
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide, maintain, and improve our services</li>
              <li>Process your registration and manage your account</li>
              <li>Enable communication between users</li>
              <li>Send you technical notices and support messages</li>
              <li>Respond to your comments and questions</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            3. Information Sharing
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>
              We do not sell your personal information. We may share your information only in the following circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>With your consent or at your direction</li>
              <li>To comply with legal obligations</li>
              <li>To protect our rights and safety</li>
              <li>In connection with a business transfer</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            4. Data Security
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>
              We implement appropriate technical and organizational measures to protect your personal information. 
              However, no method of transmission over the internet is 100% secure.
            </p>
          </div>
        </section>

        <section>
          <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            5. Your Rights
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access and update your personal information</li>
              <li>Delete your account and associated data</li>
              <li>Opt out of certain communications</li>
              <li>Request a copy of your data</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            6. Changes to This Policy
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting 
              the new Privacy Policy on this page and updating the "Last updated" date.
            </p>
          </div>
        </section>

        <section>
          <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            7. Contact Us
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>
              If you have any questions about this Privacy Policy, please contact us through our support channels.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
