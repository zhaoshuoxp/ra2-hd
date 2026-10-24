import React from 'react';
interface VersionStringProps {
    value: string;
    edition?: string;
}
export const VersionString: React.FC<VersionStringProps> = ({ value, edition }) =>
    <div className="menu-version-string" data-testid="menu-version">
        v{value}{edition && <> · <span data-testid="menu-edition">{edition}</span></>}
    </div>;
