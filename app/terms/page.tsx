'use client';

import { useTheme } from '@/components/ThemeProvider';

export default function TermsPage() {
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
          Terms of Service
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
            1. Acceptance of Terms
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>
              By accessing and using this service, you accept and agree to be bound by the terms and provision of this agreement.
            </p>
          </div>
        </section>

        <section>
          <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            2. Use License
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>
              Permission is granted to temporarily use this service for personal, non-commercial transitory viewing only. 
              This is the grant of a license, not a transfer of title, and under this license you may not:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Modify or copy the materials</li>
              <li>Use the materials for any commercial purpose or for any public display</li>
              <li>Attempt to reverse engineer any software contained in the service</li>
              <li>Remove any copyright or other proprietary notations from the materials</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            3. User Accounts
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>
              When you create an account with us, you must provide information that is accurate, complete, and current at all times. 
              You are responsible for safeguarding the password and for all activities that occur under your account.
            </p>
          </div>
        </section>

        <section>
          <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            4. User Conduct
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Post or transmit any content that is unlawful, harmful, threatening, abusive, or otherwise objectionable</li>
              <li>Impersonate any person or entity or falsely state or misrepresent your affiliation with a person or entity</li>
              <li>Interfere with or disrupt the service or servers or networks connected to the service</li>
              <li>Violate any applicable local, state, national, or international law</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            5. Content
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>
              You retain ownership of any content you submit, post, or display on or through the service. 
              By submitting content, you grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, 
              and distribute such content for the purpose of operating and promoting the service.
            </p>
          </div>
        </section>

        <section>
          <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            6. Termination
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>
              We may terminate or suspend your account and bar access to the service immediately, without prior notice or liability, 
              for any reason whatsoever, including without limitation if you breach the Terms.
            </p>
          </div>
        </section>

        <section>
          <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            7. Disclaimer
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>
              The information on this service is provided on an "as is" basis. To the fullest extent permitted by law, 
              we exclude all representations, warranties, and conditions relating to our service and the use of this service.
            </p>
          </div>
        </section>

        <section>
          <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            8. Limitation of Liability
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>
              In no event shall we, nor our directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, 
              incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, 
              or other intangible losses, resulting from your use of the service.
            </p>
          </div>
        </section>

        <section>
          <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            9. Changes to Terms
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>
              We reserve the right, at our sole discretion, to modify or replace these Terms at any time. 
              If a revision is material, we will provide at least 30 days notice prior to any new terms taking effect.
            </p>
          </div>
        </section>

        <section>
          <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            10. Contact Us
          </h2>
          <div className={`space-y-3 ${isLight ? 'text-black/80' : 'text-white/80'} leading-relaxed`}>
            <p>
              If you have any questions about these Terms of Service, please contact us through our support channels.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
