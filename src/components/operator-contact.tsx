export function OperatorContact() {
  const name = process.env.OPERATOR_NAME;
  const email = process.env.SUPPORT_EMAIL;
  return (
    <section>
      <h2>Contact and your information</h2>
      {name && email ? (
        <p>
          Operated by {name}. Contact <a href={`mailto:${email}`}>{email}</a>{" "}
          for help, questions about your information, or requests to access,
          export or delete your account and trip records.
        </p>
      ) : (
        <p>
          This instance is available for controlled evaluation while the
          operator’s contact details are being configured.
        </p>
      )}
    </section>
  );
}
