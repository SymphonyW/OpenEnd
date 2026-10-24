import {fireEvent, render, screen} from '@testing-library/react';
import {expect, it} from 'vitest';
import OwnershipIcon from './OwnershipIcon';

it('keeps a visible fallback when an application icon is missing or cannot load', () => {
    const view = render(<OwnershipIcon kind="application" iconDataURL="" name="App"/>);
    const icon = screen.getByRole('img', {name: 'App icon'});
    expect(icon.querySelector('svg')).not.toBeNull();
    view.rerender(<OwnershipIcon kind="application" iconDataURL="data:image/png;base64,broken" name="App"/>);
    fireEvent.error(icon.querySelector('img')!);
    expect(icon.querySelector('img')).toBeNull();
    expect(icon.querySelector('svg')).not.toBeNull();
    view.rerender(<OwnershipIcon kind="application" iconDataURL="data:image/png;base64,replaced" name="App"/>);
    expect(icon.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,replaced');
    view.rerender(<OwnershipIcon kind="project" iconDataURL="" name="Project"/>);
    expect(screen.getByRole('img', {name: 'Project icon'}).querySelector('svg')).not.toBeNull();
});
