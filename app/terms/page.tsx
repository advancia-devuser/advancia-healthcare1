import Header from "../components/header";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
        <div className="prose dark:prose-invert max-w-none space-y-6">
          <p>Last updated: February 21, 2026</p>
          
          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">1. Acceptance of Terms</h2>
            <p>By accessing and using Advancia Healthcare, you accept and agree to be bound by the terms and provision of this agreement. In addition, when using these particular services, you shall be subject to any posted guidelines or rules applicable to such services.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">2. Description of Service</h2>
            <p>Advancia Healthcare provides users with access to a rich collection of resources, including Medbed booking tools, health profile management, and virtual card services. You understand and agree that the Service is provided &quot;AS-IS&quot; and that Advancia Healthcare assumes no responsibility for the timeliness, deletion, mis-delivery or failure to store any user communications or personalization settings.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">3. User Conduct</h2>
            <p>You understand that all information, data, text, software, music, sound, photographs, graphics, video, messages or other materials (&quot;Content&quot;), whether publicly posted or privately transmitted, are the sole responsibility of the person from which such Content originated. This means that you, and not Advancia Healthcare, are entirely responsible for all Content that you upload, post, email, transmit or otherwise make available via the Service.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">4. Modifications to Service</h2>
            <p>Advancia Healthcare reserves the right at any time and from time to time to modify or discontinue, temporarily or permanently, the Service (or any part thereof) with or without notice. You agree that Advancia Healthcare shall not be liable to you or to any third party for any modification, suspension or discontinuance of the Service.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
